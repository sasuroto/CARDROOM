/** Atomic monotonic cooldown, using R2 conditional put (ETag CAS).
 * See https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations
 * A lost race is retried at most four times. Never fall back to an unconditional
 * put: storage failure/contention must not shorten another isolate's deadline. */
export type ProviderCooldown={until:number;status:number};
export async function persistProviderBackoff(bucket:R2Bucket|undefined,key:string,candidate:ProviderCooldown){
 const best={...candidate};
 if(!bucket)return {...best,persisted:false};
 try{
  for(let attempt=0;attempt<4;attempt++){
   const current=await bucket.get(key),saved=current?await current.json<{until?:unknown;status?:unknown}>():null;
   const until=Number(saved?.until);
   if(Number.isFinite(until)&&until>=best.until)return {until,status:Number(saved?.status)||best.status,persisted:true};
   // Existing objects must supply an ETag. Missing metadata is an incompatible
   // adapter/failure, not permission to bypass the conditional-write requirement.
   if(current&&typeof current.etag!=='string')return {...best,persisted:false};
   const onlyIf=current?{etagMatches:current.etag}:new Headers({'If-None-Match':'*'});
   const written=await bucket.put(key,JSON.stringify(best),{onlyIf,httpMetadata:{contentType:'application/json'}});
   if(written)return {...best,persisted:true};
  }
  // One readback after bounded contention: a competing longer value may have won.
  const final=await bucket.get(key),saved=final?await final.json<{until?:unknown;status?:unknown}>():null,until=Number(saved?.until);
  if(Number.isFinite(until)&&until>=best.until)return {until,status:Number(saved?.status)||best.status,persisted:true};
 }catch{/* Keep the local deadline; persistence is explicitly unconfirmed. */}
 return {...best,persisted:false};
}
