import {readCache,writeCache} from './cache';

// The cache stores successful source responses only. An outage never replaces
// their checkedAt with the time of the failed retry.
const memory=new Map<string,{value:any;at:number}>();
const pending=new Map<string,Promise<any>>();
const failures=new Map<string,{until:number;result:any}>();
export const LEAGUE_DATA_TTL=30*60*1000;
export async function cachedLeagueData<T extends {checkedAt:string|null}>(bucket:R2Bucket|undefined,key:string,ttl:number,load:()=>Promise<T>,empty:()=>T):Promise<T&{stale?:boolean;error?:string;attemptedAt?:string}>{
 const now=Date.now(),retry=failures.get(key);
 if(retry&&retry.until>now)return retry.result;
 if(pending.has(key))return pending.get(key)!;
 const work=(async()=>{
  let cached=memory.get(key)?.value;
  if(!cached)cached=await readCache(bucket,key);
  if(cached?.checkedAt&&now-Date.parse(cached.checkedAt)<ttl)return cached;
  try{
   const result=await load();memory.set(key,{value:result,at:now});failures.delete(key);
   if(memory.size>150)memory.delete(memory.keys().next().value!);
   await writeCache(bucket,key,result);return result;
  }catch{
   const result={...(cached||empty()),stale:!!cached,error:'Источник временно недоступен. Показан последний доступный срез.',attemptedAt:new Date().toISOString()};
   if(!cached)result.error='Источник временно недоступен. Подтверждённых данных пока нет.';
   failures.set(key,{until:now+60000,result});if(failures.size>150)failures.delete(failures.keys().next().value!);
   return result;
  }
 })();pending.set(key,work);
 try{return await work}finally{pending.delete(key)}
}

export function validSeason(value:string|null){return value===null?new Date().getUTCFullYear()-(new Date().getUTCMonth()<6?1:0):/^20\d{2}$/.test(value)&&Number(value)>=2020&&Number(value)<=new Date().getUTCFullYear()+1?Number(value):null}
