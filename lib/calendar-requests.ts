/** Limit one calendar invocation's pressure on the shared ESPN admission queue.
 * Workers must own their I/O: these workers/Promises live only in this call.
 * This is a dispatch cutoff, NOT a response deadline. Already-submitted jobs
 * are awaited and retain ESPN's own queue, lease, timeout and backoff guards.
 * Storage, journal and response work can extend the total request lifetime.
 */
type CalendarRequestResult<T>=PromiseSettledResult<T>&{dispatched:boolean};
export async function runCalendarRequests<T>(jobs:(()=>Promise<T>)[]):Promise<CalendarRequestResult<T>[]> {
 const results:CalendarRequestResult<T>[]=new Array(jobs.length);
 const dispatchUntil=Date.now()+30000;
 let next=0;
 async function worker(){
  for(;;){
   const index=next++;
   if(index>=jobs.length)return;
   if(Date.now()>=dispatchUntil){
    results[index]={status:'rejected',dispatched:false,reason:Object.assign(Error('Calendar request deferred: dispatch deadline'),{retryAfter:Date.now()+60000})};
    continue;
   }
   try{results[index]={status:'fulfilled',dispatched:true,value:await jobs[index]()}}
   catch(reason){results[index]={status:'rejected',dispatched:true,reason}}
  }
 }
 await Promise.all(Array.from({length:Math.min(4,jobs.length)},()=>worker()));
 return results;
}

/** A partial attempt must not hide eligible retries behind an archive TTL, or
 * invite repeated work while the known provider cooldown is still in force.
 * Reusing this cache never renews the original source/attempt timestamps.
 */
export function calendarCacheUntil(checkedAt:string,ttl:number,partial:boolean,retryAfter:unknown,now=Date.now()){
 const checked=Date.parse(checkedAt),retry=Number(retryAfter);
 if(!Number.isFinite(checked)||checked>now||retryAfter!==undefined&&!Number.isFinite(retry))return NaN;
 return partial&&Number.isFinite(retry)&&retry>checked?Math.max(checked+Math.min(ttl,60000),retry):checked+ttl;
}
