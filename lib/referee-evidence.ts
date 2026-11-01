import {appointmentState} from './referee-authority';
import {findRefereeRow} from './referee-match';
const valid=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function refereePeriod(group:any){return group?.seasonConfirmed===true&&group?.periodLabel?group.periodLabel:'Период источника не подтверждён';}
export function yellowSample(row:any){return valid(row?.yellowN)?row.yellowN:0;}
export function refereeEvidence(match:any,group:any,now=Date.now()){
 const row=findRefereeRow(group?.rows||[],match?.referee||'');
 const n=yellowSample(row),checked=Date.parse(group?.checkedAt||''),age=Number.isFinite(checked)&&checked<=now?(now-checked)/86400000:null;
 const reasons:string[]=[];
 if(!row||!valid(row.yellow))reasons.push('Нет подтверждённого среднего ЖК этого арбитра.');
 if(n<10)reasons.push(`Выборка ЖК: ${n} матчей; для включения судьи в модель требуется минимум 10.`);
 if(age===null||age>7)reasons.push('Дата статистики отсутствует, некорректна или срез старше 7 дней.');
 if(group?.seasonConfirmed!==true)reasons.push('Сезон статистики не подтверждён источником.');
 if(appointmentState(match)!=='confirmed'||match?.stale||match?.error)reasons.push('Нет актуального официально подтверждённого назначения.');
 if(match?.appointmentConflict)reasons.push('Источники расходятся в назначении арбитра.');
 const appointmentTime=Date.parse(match?.appointmentCheckedAt||'');
 if(!Number.isFinite(appointmentTime)||appointmentTime>now||now-appointmentTime>86400000)reasons.push('Назначение не проверено за последние 24 часа.');
 if(Number.isFinite(Date.parse(match?.date))&&checked>Date.parse(match.date))reasons.push('Статистика обновлена после начала матча: не используем её для предматчевой оценки.');
 const rows=(group?.rows||[]).filter((r:any)=>valid(r.yellow)&&yellowSample(r)>0);
 const baselineN=rows.reduce((s:number,r:any)=>s+yellowSample(r),0);
 const baseline=baselineN?rows.reduce((s:number,r:any)=>s+r.yellow*yellowSample(r),0)/baselineN:null;
 return {row,n,age,checkedAt:group?.checkedAt,source:group?.source,season:refereePeriod(group),seasonConfirmed:group?.seasonConfirmed===true,baseline,baselineN,referees:rows.length,reasons,eligible:reasons.length===0};
}
