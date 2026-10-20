import {readCache,writeCache} from './cache';
// One request at a time per origin, reusing identical pages within a refresh.
// Respect rate limits: do not retry a blocked origin during this refresh.
export function createSourceReader(bucket?:R2Bucket){
 const pages=new Map<string,Promise<string>>(),queues=new Map<string,Promise<unknown>>(),blocked=new Set<string>();
 return function source(url:string):Promise<string>{
  const existing=pages.get(url);if(existing)return existing;
  const origin=new URL(url).origin;
  const request=(queues.get(origin)||Promise.resolve()).catch(()=>{}).then(async()=>{
   if(blocked.has(origin))throw Error('Источник недоступен; повтор отложен');
   const key=`referee-updates/source-backoff/${new URL(url).hostname}.json`,backoff=await readCache(bucket,key);
   if(backoff?.until>Date.now())throw Error(`Источник недоступен${backoff.status?' (HTTP '+backoff.status+')':''}; повтор после ${new Date(backoff.until).toISOString()}`);
   const r=await fetch(url,{signal:AbortSignal.timeout(16000),headers:{Accept:'text/html','User-Agent':'CardroomResearch/1.0'}});
   if(r.status===429||r.status===403){blocked.add(origin);const retry=r.headers.get('Retry-After'),seconds=Number(retry),until=retry?(Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(retry)):0;await writeCache(bucket,key,{status:r.status,until:Math.max(Date.now()+6*3600000,until||0)});}
   if(!r.ok)throw Error('HTTP '+r.status);
   return r.text();
  });
  queues.set(origin,request);pages.set(url,request);return request;
 }
}
