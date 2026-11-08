import {readCache,writeCache} from './cache';

// Only accepted source snapshots replace data. A retry has its own timestamp.
export type LeagueDataFailure='empty'|'incomplete'|'regression'|'invalid';
export class LeagueDataError extends Error {
 constructor(public reason:LeagueDataFailure){super('League data failed validation')}
}
type CachePolicy<T>={validate:(value:T,previous?:T)=>T};
const memory=new Map<string,{value:any;at:number}>();
const pending=new Map<string,Promise<any>>();
const failures=new Map<string,{until:number;result:any}>();
export const LEAGUE_DATA_TTL=30*60*1000;
export async function cachedLeagueData<T extends {checkedAt:string|null}>(bucket:R2Bucket|undefined,key:string,ttl:number,load:()=>Promise<T>,empty:()=>T,policy?:CachePolicy<T>):Promise<T&{stale?:boolean;error?:string;attemptedAt?:string;nextCheckAt?:string;failureReason?:string}>{
 const now=Date.now(),retry=failures.get(key);
 const accepted=(value:T|undefined,previous?:T):T|undefined=>{if(!value)return;try{return policy?policy.validate(value,previous):value}catch{return}};
 const choose=(known:T|undefined,candidate:T|undefined):T|undefined=>{
  if(!candidate||known&&Date.parse(candidate.checkedAt||'')<Date.parse(known.checkedAt||''))return known;
  return accepted(candidate,known)||known;
 };
 const remember=(value:T)=>{memory.set(key,{value,at:Date.now()});if(memory.size>150)memory.delete(memory.keys().next().value!)};
 const latest=async(known:T|undefined)=>{const selected=choose(known,await readCache(bucket,key));if(policy&&selected)remember(selected);return selected};
 if(retry&&retry.until>now){
  if(!policy)return retry.result;
  // Host cooldown blocks upstream requests, never reads of another writer's data.
  const known=choose(accepted(memory.get(key)?.value),accepted(retry.result));
  const saved=await latest(known);
  if(saved&&Date.parse(saved.checkedAt||'')>=Date.parse(retry.result.attemptedAt||'')){
   return {...saved,stale:now-Date.parse(saved.checkedAt||'')>=ttl,nextCheckAt:new Date(retry.until).toISOString()};
  }
  return {...retry.result,...(saved||{}),stale:!!saved};
 }
 if(pending.has(key))return pending.get(key)!;
 const work=(async()=>{
  let cached=accepted(memory.get(key)?.value);
  // Read persisted state when due, so an older instance-local snapshot does not
  // hide a newer saved response. This is not a distributed writer lock.
  if(!cached||now-Date.parse(cached.checkedAt||'')>=ttl){
   cached=await latest(cached);
  }
  if(cached?.checkedAt&&now-Date.parse(cached.checkedAt)<ttl)return cached;
  try{
   let result=await load();if(policy)result=policy.validate(result,cached);
   // Recheck after I/O: a newer snapshot must not be replaced by this response.
   if(policy){
    cached=await latest(cached);
    if(cached&&Date.parse(cached.checkedAt||'')>Date.parse(result.checkedAt||''))return cached;
    result=policy.validate(result,cached);
   }
   remember(result);failures.delete(key);
   await writeCache(bucket,key,result);return result;
  }catch(error){
   if(policy)cached=await latest(cached);
   const attemptedAt=new Date().toISOString(),candidate=(error as {retryAfter?:unknown})?.retryAfter;
   const until=Math.max(Date.now()+60000,typeof candidate==='number'&&Number.isFinite(candidate)?candidate:0);
   const failureReason=error instanceof LeagueDataError?error.reason:'unavailable';
   const invalid=failureReason!=='unavailable';
   const result={...(cached||empty()),stale:!!cached,error:invalid?'Источник вернул неполную или неподтверждённую таблицу.':'Источник временно недоступен.',attemptedAt,nextCheckAt:new Date(until).toISOString(),failureReason};
   result.error+=cached?' Показан последний подтверждённый срез.':' Подтверждённых данных пока нет.';
   failures.set(key,{until,result});if(failures.size>150)failures.delete(failures.keys().next().value!);
   return result;
  }
 })();pending.set(key,work);
 try{return await work}finally{pending.delete(key)}
}

export function validSeason(value:string|null){return value===null?new Date().getUTCFullYear()-(new Date().getUTCMonth()<6?1:0):/^20\d{2}$/.test(value)&&Number(value)>=2020&&Number(value)<=new Date().getUTCFullYear()+1?Number(value):null}
