import {calendarDay} from './calendar-scope';
import {panelStatus} from './match-status';
import {statusCheckedAt,statusIsStale,mergeMatchStatus,STATUS_FIELDS,type StatusRecord} from './match-status-evidence';

const validTime=(value:unknown)=>typeof value==='string'?Date.parse(value):NaN;
export const dailyStamp=(value:unknown)=>Number.isFinite(validTime(value))?new Date(value as string).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'дата неизвестна';
export function dailyMatches<T extends StatusRecord>(events:T[],today:string,league:string,now:number){
 return events.filter(m=>Number.isFinite(validTime(m.date))&&calendarDay(new Date(m.date as string))===today&&(league==='all'||m.league===league)).sort((a,b)=>{
  const rank=(m:StatusRecord)=>dailyStatus(m,now).live?0:validTime(m.date)>=now&&m.state!=='post'?1:2;
  return rank(a)-rank(b)||validTime(a.date)-validTime(b.date);
 });
}
export function dailyStatus(match:StatusRecord,now:number,failed=false){
 const status=panelStatus(match,now),checked=statusCheckedAt(match),at=validTime(checked);
 const fresh=!failed&&!statusIsStale(match)&&Number.isFinite(at)&&at<=now&&now-at<=120000;
 const live=fresh&&(status.kind==='live'||status.kind==='halftime');
 const label=(status.kind==='live'||status.kind==='halftime')&&!fresh?'Статус уточняется':status.kind==='scheduled'&&Number.isFinite(validTime(match.date))?new Date(match.date as string).toLocaleTimeString('ru-RU',{timeZone:'Asia/Tbilisi',hour:'2-digit',minute:'2-digit'}):status.label+(live&&status.minute?' · '+status.minute:'');
 const provenance=(fresh?'Данные на ':status.showScore?'Последний известный счёт · ':'Сохранено · ')+dailyStamp(checked)+(Number.isFinite(at)&&at>now?' · дата в будущем':'');
 return {live,label,provenance,showScore:status.showScore};
}

/** A partial calendar response must not roll back a newer confirmed local score. */
export function mergeDailyMatches(previous:StatusRecord[],incoming:StatusRecord[],errors:string[],attempt:unknown,now=Date.now()){
 const key=(m:StatusRecord)=>String(m.league)+':'+String(m.id),old=new Map(previous.map(m=>[key(m),m]));
 const next=incoming.map(row=>{
  const current=old.get(key(row));
  const observed=validTime(statusCheckedAt(row)),invalid=!Number.isFinite(observed)||observed>now;
  const failed=errors.includes(String(row.league))||statusIsStale(row)||invalid;
  const update={...row,statusLastAttemptAt:attempt,...(failed?{statusStale:true}:{}),...(invalid?{statusCheckedAt:undefined,fetchedAt:undefined}:{})};
  if(!current)return {...row,statusLastAttemptAt:attempt,...(failed?{statusStale:true}:{})};
  // Invalid saved evidence must not block a later genuine observation.
  const priorTime=validTime(statusCheckedAt(current));
  const comparable=!invalid&&(!Number.isFinite(priorTime)||priorTime>now)?{...current,statusCheckedAt:''}:current;
  const accepted=mergeMatchStatus(comparable,update);
  const result={...current,...row};
  for(const field of [...STATUS_FIELDS,'date','statusCheckedAt','statusLastAttemptAt','statusStale','statusError','statusSource','statusWarning'] as const){
   if(field in accepted)result[field]=accepted[field];else delete result[field];
  }
  // Legacy checkedAt is a valid saved observation. Preserve it explicitly if
  // merge rejected an undated/older update, rather than reusing new metadata.
  if(!result.statusCheckedAt)result.statusCheckedAt=statusCheckedAt(accepted);
  return result;
 });
 const present=new Set(next.map(key));
 for(const row of previous)if(errors.includes(String(row.league))&&!present.has(key(row)))next.push({...row,statusStale:true,statusLastAttemptAt:attempt});
 return next;
}
