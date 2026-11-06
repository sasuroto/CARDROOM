import {appointmentState} from './referee-authority';
export function appointmentCoverage(matches:any[]){return {official:matches.filter(m=>appointmentState(m)==='confirmed'&&!m.stale).length,fallback:matches.filter(m=>appointmentState(m)==='unconfirmed').length,stale:matches.filter(m=>appointmentState(m)==='stale'||m.stale).length,missing:matches.filter(m=>!m.referee).length,completed:matches.filter(m=>appointmentState(m)==='completed').length};}
export function sourceMonitor(report:any,stats:any,now=Date.now()){
 const errors=(report?.errors||[]).filter((s:any)=>typeof s==='string'&&s.startsWith('Статистика'));
 const message=errors.join(' '),source=report?.sourceHealth?.statistics||{},retry=source.retryAt||message.match(/повтор после (\d{4}-\d\d-\d\dT[\d:.]+Z)/)?.[1];
 const cooldown=Number.isFinite(Date.parse(retry||''))&&Date.parse(retry)>now;
 const state=report?.statsStatus==='snapshot'||stats?.refreshMode==='snapshot'?'snapshot':report?.statsStatus==='updated'?'updated':cooldown?'cooldown':source.httpStatus===403||/403/.test(message)?'forbidden':source.httpStatus===429||/429/.test(message)?'rate-limited':report?'unavailable':'not-checked';
 const labels:Record<string,string>={snapshot:'Ручной срез',cooldown:'Пауза перед повтором',forbidden:'Источник отказал в доступе (403)','rate-limited':'Источник ограничил запросы (429)',updated:'Последний проход обновил статистику',unavailable:'Статистика не обновилась','not-checked':'Нет сохранённого отчёта проверки'};
 return {state,label:labels[state],retryAt:cooldown?retry:null,httpStatus:source.httpStatus||(/403/.test(message)?403:/429/.test(message)?429:null),lastSuccess:stats?.checkedAt||report?.statsCheckedAt||null,lastAttempt:report?.startedAt||null,nextCheck:report?.nextCheckAt||null,overdue:!!report?.nextCheckAt&&Date.parse(report.nextCheckAt)<now,persisted:report?.persisted===true,coverage:report?.appointmentCoverage||null};
}
