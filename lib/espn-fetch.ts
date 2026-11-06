import {readCache} from './cache';
import {persistProviderBackoff} from './provider-backoff';

/** Shared plain-data host cooldown and admission leases, never shared Promises.
 * Workers associates I/O with the initiating request. A global callback/resolver
 * queue can run request B's fetch in request A and strand B when A finishes.
 * Every waiter instead owns its own timer/fetch continuation. R2 shares the
 * cooldown across isolates; it is not a distributed concurrency lock. */
type Ticket={queuedUntil:number;activeUntil:number};
type Host={tickets:Ticket[];until:number;status:number;persisted:boolean};
const hosts=new Map<string,Host>();
const CONCURRENCY=4,MAX_PENDING=64,QUEUE_BUDGET=15000,LEASE=30000;
export const espnBackoffKey=(hostname:string)=>`referee-updates/source-backoff/${hostname}.json`;
const limited=(until:number,status=429,persisted=true)=>Object.assign(Error('HTTP '+status),{retryAfter:until,cooldownPersisted:persisted});
const deferred=()=>Object.assign(Error('ESPN request deferred: queue deadline'),{retryAfter:Date.now()+60000});
function prune(host:Host){const now=Date.now();host.tickets=host.tickets.filter(ticket=>(ticket.activeUntil||ticket.queuedUntil)>now)}
export async function fetchEspn(url:string,bucket?:R2Bucket):Promise<unknown>{
 const hostname=new URL(url).hostname;
 if(!['site.api.espn.com','site.web.api.espn.com'].includes(hostname))throw Error('Unsupported ESPN origin');
 let host=hosts.get(hostname);if(!host){host={tickets:[],until:0,status:429,persisted:false};hosts.set(hostname,host)}
 prune(host);
 if(host.tickets.length>=MAX_PENDING)throw Object.assign(Error('ESPN request queue full'),{retryAfter:Date.now()+60000});
 const ticket:Ticket={queuedUntil:Date.now()+QUEUE_BUDGET,activeUntil:0};host.tickets.push(ticket);
 try{
  for(;;){
   prune(host);
   if(!host.tickets.includes(ticket))throw deferred();
   const active=host.tickets.filter(item=>item.activeUntil>0).length;
   const position=host.tickets.filter(item=>!item.activeUntil).indexOf(ticket);
   if(position<CONCURRENCY-active){ticket.activeUntil=Date.now()+LEASE;break}
   // Timer belongs to THIS invocation. Never put callbacks or Promises in host.
   await new Promise<void>(resolve=>setTimeout(resolve,50));
  }
  const saved=await readCache(bucket,espnBackoffKey(hostname));
  if(Number(saved?.until)>=host.until&&Number(saved?.until)>0){host.until=Number(saved.until);host.status=Number(saved.status)||429;host.persisted=true}
  if(host.until>Date.now())throw limited(host.until,host.status,host.persisted);
  // An abandoned request cannot leak a permit forever. If a slow cache read
  // outlived its lease, do not launch I/O in a slot another caller may now own.
  if(ticket.activeUntil<=Date.now()||!host.tickets.includes(ticket))throw deferred();
  ticket.activeUntil=Date.now()+LEASE;
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(response.status===429||response.status===403){
   const retry=response.headers.get('Retry-After'),seconds=Number(retry),parsed=retry?(Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(retry)):0;
   const until=Math.max(host.until,Date.now()+(response.status===403?6:1)*3600000,Number.isFinite(parsed)?parsed:0);
   if(until>host.until)host.persisted=false;
   host.until=until;host.status=response.status;
   // CAS, not a global Promise chain, serializes monotonic R2 updates safely.
   const result=await persistProviderBackoff(bucket,espnBackoffKey(hostname),{status:host.status,until:host.until});
   if(result.until>=host.until){host.until=result.until;host.status=result.status;host.persisted=result.persisted}
   throw limited(host.until,host.status,host.persisted);
  }
  if(!response.ok)throw Error('HTTP '+response.status);
  return await response.json();
 }finally{host.tickets=host.tickets.filter(item=>item!==ticket)}
}
