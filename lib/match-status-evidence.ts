/** Score/status provenance is independent from referee appointment freshness. */
export type StatusRecord=Record<string,unknown>;
export const STATUS_FIELDS = ['state','statusName','statusDetail','clock','homeScore','awayScore','period','homeId','awayId'] as const;
export function statusCheckedAt(match:StatusRecord|null|undefined):string|undefined {
 if(typeof match?.statusCheckedAt==='string')return match.statusCheckedAt;
 return typeof match?.fetchedAt==='string'?match.fetchedAt:typeof match?.checkedAt==='string'?match.checkedAt:undefined;
}
export function statusIsStale(match:StatusRecord|null|undefined):boolean {
 return typeof match?.statusStale==='boolean'?match.statusStale:!!(match?.stale||match?.error);
}
export function normalizeScore(value:unknown):string|number|null {
 if(typeof value==='number')return Number.isInteger(value)&&value>=0&&value<=999?value:null;
 if(typeof value==='string'&&/^\d{1,3}$/.test(value.trim()))return value.trim();
 return null;
}
const statusId=(value:unknown)=>typeof value==='string'&&/^\d+$/.test(value)?value:typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?String(value):null;
const statusText=(value:unknown,limit:number)=>typeof value==='string'&&value.length<=limit&&!/[\u0000-\u001f\u007f]/.test(value)?value:null;
export function normalizeStatusSnapshot(value:StatusRecord|null|undefined){
 const state=typeof value?.state==='string'&&['pre','in','post'].includes(value.state)?value.state:null,homeScore=normalizeScore(value?.homeScore),awayScore=normalizeScore(value?.awayScore);
 return {state,period:typeof value?.period==='number'&&Number.isInteger(value.period)&&value.period>=0?value.period:null,homeId:statusId(value?.homeId),awayId:statusId(value?.awayId),statusName:statusText(value?.statusName,100),statusDetail:statusText(value?.statusDetail,140),clock:statusText(value?.clock,32),homeScore,awayScore,statusWarning:(state==='in'||state==='post')&&(homeScore===null||awayScore===null)?'Источник не подтвердил корректный счёт полностью. Неизвестные значения показаны прочерком.':null};
}
const millis=(value:unknown)=>typeof value==='string'?Date.parse(value):NaN;
/** Accept one coherent provider snapshot, never an older score with a newer label. */
export function mergeMatchStatus(current:StatusRecord,incoming:StatusRecord|null|undefined){
 if(!incoming||String(incoming.id)!==String(current.id)||incoming.league!==current.league)return current;
 // checkedAt alone may be an appointment timestamp, not a score observation.
 const checked=typeof incoming.statusCheckedAt==='string'?incoming.statusCheckedAt:incoming.fetchedAt,incomingTime=millis(checked),currentTime=millis(statusCheckedAt(current));
 const stale=statusIsStale(incoming);
 const failure=()=>{
  if(!stale)return current;
  const attempt=incoming.statusLastAttemptAt||incoming.lastAttemptAt||incoming.fetchedAt,previousAttempt=current.statusLastAttemptAt||statusCheckedAt(current);
  if(Number.isFinite(millis(attempt))&&Number.isFinite(millis(previousAttempt))&&millis(attempt)<millis(previousAttempt))return current;
  return {...current,statusStale:true,statusError:incoming.statusError||incoming.error||'Обновление статуса не подтверждено.',...(Number.isFinite(millis(attempt))?{statusLastAttemptAt:attempt}:{})};
 };
 if((typeof incoming.state!=='string'||!['pre','in','post'].includes(incoming.state))||!Number.isFinite(incomingTime)||Number.isFinite(currentTime)&&incomingTime<currentTime)return failure();
 // Legacy stale responses do not establish status provenance. Explicit metadata
 // can carry the last confirmed snapshot through an outage, labelled as stale.
 if(stale&&!Number.isFinite(millis(incoming.statusCheckedAt)))return failure();
 const attempt=incoming.statusLastAttemptAt||incoming.lastAttemptAt||checked;
 const incomingAttempt=millis(attempt),currentAttempt=millis(current.statusLastAttemptAt);
 if(incomingTime===currentTime&&Number.isFinite(currentAttempt)&&incomingAttempt<currentAttempt)return current;
 const out={...current};
 Object.assign(out,normalizeStatusSnapshot(incoming));
 if(typeof incoming.date==='string'&&Number.isFinite(Date.parse(incoming.date)))out.date=incoming.date;
 out.statusCheckedAt=checked;
 out.statusLastAttemptAt=attempt;
 out.statusStale=stale;
 out.statusError=stale?(incoming.statusError||incoming.error||'Последний подтверждённый срез матча; обновление не удалось.'):null;
 out.statusSource=incoming.statusSource||current.statusSource||null;
 return out;
}
