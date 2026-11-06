import {KICKOFF_ACTIVE_WINDOW,panelStatus} from './match-status';
import type {StatusRecord} from './match-status-evidence';
import {mergeMatchStatus,normalizeStatusSnapshot,statusCheckedAt,statusIsStale} from './match-status-evidence';

export const calendarDay=(now=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tbilisi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export function calendarInterval(events:StatusRecord[],date:string,now=Date.now()){
 if(events.some(m=>{const kickoff=Date.parse(String(m.date||''));return panelStatus(m,now).polls&&Number.isFinite(kickoff)&&now-kickoff>=-15*60000&&now-kickoff<=KICKOFF_ACTIVE_WINDOW}))return 60000;
 if(events.some(m=>m.state==='pre'&&Date.parse(String(m.date||''))>=now&&Date.parse(String(m.date||''))-now<=15*60000))return 60000;
 return date===calendarDay(now)?5*60000:30*60000;
}
export function calendarCacheTtl(events:StatusRecord[],date:string,upcoming=false,now=Date.now()){
 return upcoming?30*60000:calendarInterval(events,date,now);
}
export function calendarDelay(base:number,failures:number,retryAt=0,now=Date.now()){
 return Math.max(base,failures?Math.min(30*60000,base*2**Math.min(failures,6)):base,retryAt-now);
}
export function mergeCalendarEvents(previous:StatusRecord[],incoming:StatusRecord[]){
 const old=new Map(previous.map(m=>[String(m.league)+':'+String(m.id),m]));
 return incoming.map(m=>{
 const prior=old.get(String(m.league)+':'+String(m.id));if(!prior)return {...m,...normalizeStatusSnapshot(m)};
 const status=mergeMatchStatus(prior,m),result={...prior,...m};
 for(const field of ['state','statusName','statusDetail','clock','homeScore','awayScore','date','home','away','statusCheckedAt','statusLastAttemptAt','statusSource','statusStale','statusError','statusWarning'])result[field]=status[field];
 if(Date.parse(String(m.fetchedAt||''))<Date.parse(String(prior.fetchedAt||'')))result.fetchedAt=prior.fetchedAt;
 return result;
 });
}
export function calendarFreshness(events:StatusRecord[],date:string,checkedAt:string,failed:boolean,now=Date.now()){
 const checked=Date.parse(checkedAt||''),maxAge=Math.max(120000,calendarInterval(events,date,now)*2);
 const stale=failed||!Number.isFinite(checked)||now-checked>maxAge||checked>now+60000||events.some(m=>{const observed=Date.parse(statusCheckedAt(m)||'');return statusIsStale(m)||!Number.isFinite(observed)||now-observed>maxAge||observed>now+60000});
 return {stale,label:!checkedAt?'Сохранённый срез · ещё не подтверждён':stale?'Не все данные подтверждены':'Календарь проверен'};
}

/** One in-flight request, no hidden/offline traffic, abortable and bounded retry.
 * Call wake on visibility/network/focus changes; retry deadlines survive wake. */
export function createCalendarRefreshLoop(options:{
 load:(signal:AbortSignal)=>Promise<{failed?:boolean,retryAt?:number}>,
 active:()=>boolean,interval:()=>number,onPause?:()=>void,
 now?:()=>number,setTimer?:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>,clearTimer?:(id:ReturnType<typeof setTimeout>)=>void
}){
 const now=options.now||Date.now,setTimer=options.setTimer||setTimeout,clearTimer=options.clearTimer||clearTimeout;
 let timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|null=null,disposed=false,failures=0,nextAt=0,lastStart=-Infinity;
 const clear=()=>{if(timer!==undefined){clearTimer(timer);timer=undefined}};
 const schedule=()=>{clear();if(!disposed&&options.active())timer=setTimer(()=>void run(),Math.max(0,nextAt-now()))};
 async function run(manual=false){
  if(disposed||controller)return;
  if(!options.active()){clear();options.onPause?.();return}
  if(now()<nextAt&&(!manual||failures>0)||now()-lastStart<5000){schedule();return}
  clear();const request=new AbortController();controller=request;lastStart=now();
  try{const result=await options.load(request.signal);if(disposed||request.signal.aborted)return;failures=result.failed?failures+1:0;nextAt=now()+calendarDelay(options.interval(),failures,result.retryAt||0,now())}
  catch{if(!disposed&&!request.signal.aborted){failures++;nextAt=now()+calendarDelay(options.interval(),failures,0,now())}}
  finally{if(controller===request)controller=null;if(!disposed)schedule()}
 }
 return {
  start:()=>void run(),
  refresh:()=>void run(true),
  wake:()=>{if(!options.active()){clear();controller?.abort();options.onPause?.();return}if(failures===0)nextAt=Math.max(now(),lastStart+5000);void run()},
  stop:()=>{disposed=true;clear();controller?.abort()},
 };
}
