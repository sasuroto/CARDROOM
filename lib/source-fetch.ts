import {readCache,writeCache} from './cache';
// One request at a time per origin, reusing identical pages within a refresh.
// Respect rate limits: do not retry a blocked origin during this refresh, honour
// Retry-After, keep a gap between requests and a per-origin cap per pass. A pass
// deadline turns the remaining queue into "deferred" instead of stacking timeouts.
export type SourceErrorKind='deferred'|'backoff'|'timeout'|'http'|'network';
export class SourceError extends Error{constructor(message:string,public kind:SourceErrorKind,public until?:number){super(message)}}
export type SourceOptions={deadline?:number;gapMs?:number;maxPerOrigin?:number;timeoutMs?:number};
const backoffKey=(url:string)=>`referee-updates/source-backoff/${new URL(url).hostname}.json`;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
// 403/429 block the host for at least six hours; 503 for at least 30 minutes; a timeout for 15.
export async function noteSourceBackoff(bucket:R2Bucket|undefined,url:string,status:number,retryAfter:string|null){
 const seconds=Number(retryAfter),until=retryAfter?(Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(retryAfter)):0;
 const floor=status===503?30*60000:status===0?15*60000:6*3600000,value={status,until:Math.max(Date.now()+floor,Number.isFinite(until)?until:0)};
 await writeCache(bucket,backoffKey(url),value);return value.until;
}
export function createSourceReader(bucket?:R2Bucket,options:SourceOptions={}){
 const {deadline=Infinity,gapMs=0,maxPerOrigin=Infinity,timeoutMs=16000}=options;
 const pages=new Map<string,Promise<string>>(),queues=new Map<string,Promise<unknown>>(),blocked=new Map<string,SourceError>(),used=new Map<string,number>();
 return function source(url:string):Promise<string>{
  const existing=pages.get(url);if(existing)return existing;
  const origin=new URL(url).origin;
  const request=(queues.get(origin)||Promise.resolve()).catch(()=>{}).then(async()=>{
   const stop=blocked.get(origin);if(stop)throw stop;
   const count=used.get(origin)||0;
   if(count>=maxPerOrigin)throw new SourceError('Отложено: лимит запросов к источнику за проход','deferred');
   const backoff=await readCache(bucket,backoffKey(url));
   if(backoff?.until>Date.now())throw new SourceError(`Источник недоступен${backoff.status?' (HTTP '+backoff.status+')':''}; повтор после ${new Date(backoff.until).toISOString()}`,'backoff',backoff.until);
   if(count&&gapMs)await sleep(gapMs);
   const left=deadline-Date.now();if(left<2000)throw new SourceError('Отложено: время прохода исчерпано','deferred');
   used.set(origin,count+1);
   let r:Response;
   try{r=await fetch(url,{signal:AbortSignal.timeout(Math.min(timeoutMs,left)),headers:{Accept:'text/html','User-Agent':'CardroomResearch/1.0'}})}
   catch(e){
    if((e as Error)?.name!=='TimeoutError')throw new SourceError('Сеть: '+String((e as Error)?.message||e),'network');
    // A slow host does not hold the queue: its remaining pages wait for the next pass.
    const until=await noteSourceBackoff(bucket,url,0,null);
    blocked.set(origin,new SourceError('Отложено: источник не ответил вовремя','deferred'));
    throw new SourceError('Таймаут ответа источника','timeout',until);
   }
   if(r.status===429||r.status===403||r.status===503){const until=await noteSourceBackoff(bucket,url,r.status,r.headers.get('Retry-After'));const error=new SourceError('HTTP '+r.status,'backoff',until);blocked.set(origin,error);throw error}
   if(!r.ok)throw new SourceError('HTTP '+r.status,'http');
   return r.text();
  });
  queues.set(origin,request);pages.set(url,request);return request;
 }
}
