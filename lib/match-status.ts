// Match status for the My Matches panel, from ESPN status fields as passed through
// /api/match and /api/matches. Unknown codes fall back to the coarse state; missing
// data is reported as unavailable, never guessed.

export type StatusKind='scheduled'|'live'|'halftime'|'finished'|'suspended'|'postponed'|'cancelled'|'delayed'|'unknown'|'unavailable';
export type PanelStatus={kind:StatusKind,label:string,minute:string|null,showScore:boolean,polls:boolean};

const LIVE_CODES=/STATUS_(FIRST_HALF|SECOND_HALF|IN_PROGRESS|OVERTIME|EXTRA_TIME|FIRST_EXTRA|SECOND_EXTRA|SHOOTOUT|END_OF_REGULATION|END_OF_EXTRATIME)/;

export function panelStatus(match:any):PanelStatus{
 if(!match||(!match.state&&!match.statusName))return {kind:'unavailable',label:'Нет данных провайдера',minute:null,showScore:false,polls:false};
 const name=String(match.statusName||''),detail=String(match.statusDetail||'');
 const clock=typeof match.clock==='string'&&/\d/.test(match.clock)&&match.clock!=="0'"?match.clock:null;
 if(/POSTPONED/.test(name))return {kind:'postponed',label:'Перенесён',minute:null,showScore:false,polls:false};
 if(/CANCEL/.test(name))return {kind:'cancelled',label:'Отменён',minute:null,showScore:false,polls:false};
 if(/SUSPENDED|ABANDONED/.test(name))return {kind:'suspended',label:/ABANDONED/.test(name)?'Прерван':'Приостановлен',minute:clock,showScore:true,polls:/SUSPENDED/.test(name)};
 if(/DELAYED/.test(name))return {kind:'delayed',label:'Начало задерживается',minute:null,showScore:false,polls:true};
 if(/HALFTIME/.test(name)||detail==='HT')return {kind:'halftime',label:'Перерыв',minute:'HT',showScore:true,polls:true};
 if(LIVE_CODES.test(name)||(!name&&match.state==='in'))return {kind:'live',label:'LIVE',minute:clock,showScore:true,polls:true};
 if(/FULL_TIME|FINAL/.test(name)||(!name&&match.state==='post')){
  const extra=/AET/.test(name)||/AET/.test(detail)?' · доп. время':/PEN/.test(name)||/Pen/i.test(detail)?' · по пенальти':'';
  return {kind:'finished',label:'Завершён'+extra,minute:null,showScore:true,polls:false};
 }
 if(/SCHEDULED/.test(name)||match.state==='pre')return {kind:'scheduled',label:'Предстоит',minute:null,showScore:false,polls:false};
 if(match.state==='in')return {kind:'live',label:'LIVE',minute:clock,showScore:true,polls:true};
 return {kind:'unknown',label:'Статус не распознан',minute:null,showScore:match.state==='post',polls:false};
}

// Refresh cadence. The server caches ESPN summaries (30 s while live), so client
// polls never reach ESPN more often than that, whatever the number of viewers.
export const POLL={live:30000,soon:60000,idle:10*60000,maxBackoff:15*60000};
export function nextDelay({anyLive,anySoon,failures,retryAt,now=Date.now(),jitter=Math.random()}:{anyLive:boolean,anySoon:boolean,failures:number,retryAt?:number|null,now?:number,jitter?:number}){
 const base=anyLive?POLL.live:anySoon?POLL.soon:POLL.idle;
 const backoff=failures>0?Math.min(POLL.maxBackoff,base*2**Math.min(failures,6)):base;
 const spread=failures>0?Math.min(POLL.maxBackoff,backoff*(0.8+0.4*jitter)):backoff;
 return Math.max(spread,retryAt&&retryAt>now?retryAt-now:0);
}

// A score is "current" only if it came from a fresh, successful response.
export function freshness(entry:{receivedAt?:number|null,data?:any,failed?:boolean}|undefined,status:PanelStatus,now=Date.now()){
 if(!entry?.receivedAt||!entry.data)return 'unavailable' as const;
 const age=now-entry.receivedAt,limit=status.polls?3*POLL.live+5000:2*POLL.idle;
 if(entry.data.stale||entry.failed||age>limit)return 'stale' as const;
 return 'current' as const;
}

export function localKickoff(date:string|undefined,timeZone?:string){
 if(!date||!Number.isFinite(Date.parse(date)))return null;
 const tz=timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone;
 const d=new Date(date);
 return {day:d.toLocaleDateString('ru-RU',{timeZone:tz,day:'numeric',month:'short',weekday:'short'}),time:d.toLocaleTimeString('ru-RU',{timeZone:tz,hour:'2-digit',minute:'2-digit'}),tz};
}
