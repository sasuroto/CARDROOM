export type StatusKind='scheduled'|'live'|'halftime'|'finished'|'suspended'|'postponed'|'cancelled'|'delayed'|'unknown'|'unavailable';
export type PanelStatus={kind:StatusKind,label:string,minute:string|null,showScore:boolean,polls:boolean};

const LIVE_CODES=/STATUS_(FIRST_HALF|SECOND_HALF|IN_PROGRESS|OVERTIME|EXTRA_TIME|FIRST_EXTRA|SECOND_EXTRA|SHOOTOUT|END_OF_REGULATION|END_OF_EXTRATIME)/;
// A stale scheduled fixture must not keep every visitor polling forever. The
// time window changes refresh frequency only; it never invents a final result.
export const KICKOFF_ACTIVE_WINDOW=6*60*60*1000;

export function panelStatus(match:any,now=Date.now()):PanelStatus{
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
 if(/SCHEDULED/.test(name)||match.state==='pre'){
  // The provider often flips to 'in' a few minutes after kickoff: never claim "upcoming" once kickoff has passed.
  const kickoff=Date.parse(match.date||'');
  if(Number.isFinite(kickoff)&&kickoff<=now)return {kind:'unknown',label:'Статус уточняется',minute:null,showScore:false,polls:now-kickoff<=KICKOFF_ACTIVE_WINDOW};
  return {kind:'scheduled',label:'Предстоит',minute:null,showScore:false,polls:false};
 }
 if(match.state==='in')return {kind:'live',label:'LIVE',minute:clock,showScore:true,polls:true};
 return {kind:'unknown',label:'Статус не распознан',minute:null,showScore:match.state==='post',polls:false};
}

export const POLL={live:30000,soon:60000,idle:10*60000,maxBackoff:15*60000};
export function nextDelay({anyLive,anySoon,failures,retryAt,now=Date.now(),jitter=Math.random()}:{anyLive:boolean,anySoon:boolean,failures:number,retryAt?:number|null,now?:number,jitter?:number}){
 const base=anyLive?POLL.live:anySoon?POLL.soon:POLL.idle;
 const backoff=failures>0?Math.min(POLL.maxBackoff,base*2**Math.min(failures,6)):base;
 const spread=failures>0?Math.min(POLL.maxBackoff,backoff*(0.8+0.4*jitter)):backoff;
 return Math.max(spread,retryAt&&retryAt>now?retryAt-now:0);
}

/** Detail views retain minute refresh near kickoff, slow down historical/finished rows. */
export function detailPollDelay(match:any,now=Date.now()){
 const status=panelStatus(match,now),kickoff=Date.parse(match?.date||'');
 if(['finished','cancelled','postponed'].includes(status.kind))return POLL.idle;
 if(Number.isFinite(kickoff)&&status.kind==='unknown'&&!status.polls&&now-kickoff>KICKOFF_ACTIVE_WINDOW)return POLL.idle;
 if(status.kind==='scheduled'&&Number.isFinite(kickoff)&&kickoff-now>15*60000)return 5*60000;
 return POLL.soon;
}
