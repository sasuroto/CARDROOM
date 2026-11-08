import {dailyMatches,dailyStatus} from './daily-strip';
import {panelStatus} from './match-status';
import type {StatusRecord} from './match-status-evidence';
export type DailyCoverage={date:string;competitionIds:string[];errors:string[]};
export type DailyLeague={id:string;name:string};
const strings=(value:unknown)=>Array.isArray(value)?[...new Set(value.filter((id):id is string=>typeof id==='string'))]:[];
export function readDailyCoverage(date:string,value:Record<string,unknown>):DailyCoverage {
 // HTTP success without explicit coverage is not proof that all leagues were checked.
 return {date,competitionIds:strings(value.competitionIds),errors:strings(value.errors)};
}
export function dailyCoverageSummary(leagues:DailyLeague[],coverage:DailyCoverage|null,today:string,failed:boolean){
 const current=coverage?.date===today?coverage:null;
 const rows=leagues.map(league=>({...league,state:failed?'unavailable':!current?'unchecked':current.errors.includes(league.id)?'failed':current.competitionIds.includes(league.id)?'received':'unchecked'}));
 return {rows,received:rows.filter(row=>row.state==='received').length,total:rows.length,incomplete:!rows.length||rows.some(row=>row.state!=='received')};
}
export function dailyListMatches<T extends StatusRecord>(events:T[],today:string,league:string,now:number){
 const seen=new Set<string>();
 return dailyMatches(events,today,league,now).filter(match=>{
  const key=String(match.league)+':'+String(match.id);if(seen.has(key))return false;seen.add(key);return true;
 }).sort((a,b)=>Date.parse(String(a.date))-Date.parse(String(b.date))||String(a.league).localeCompare(String(b.league))||String(a.id).localeCompare(String(b.id)));
}
export function dailyListStatus(match:StatusRecord,now:number,failed:boolean){
 const evidence=dailyStatus(match,now,failed);
 return {...evidence,label:panelStatus(match,now).kind==='scheduled'?'Предстоит':evidence.label};
}
