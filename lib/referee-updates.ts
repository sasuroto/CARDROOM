import {normalizeRefereeSeason} from './referee-season';
import {getUEFAOfficials,applyUEFAOfficials} from './uefa-officials';
import {getDFBOfficials,applyDFBOfficials} from './dfb-officials';
import {getAdvanceOfficials,applyAdvanceOfficials} from './advance-officials';
import {readCache} from './cache';
import {applyCurrentAppointment} from './current-context';
import {withAppointment} from './fixture-display';
import {plMatch,getPLOfficials,applyPLOfficials} from './pl-officials';

export const REFEREE_INTERVAL=60*60*1000;
export const refereeUpdateKey=(league:string)=>`referee-updates/v1/${league}.json`;
const newer=(a?:string,b?:string)=>Date.parse(a||'')> (Date.parse(b||'')||0);

export async function mergeRefereeUpdates(data:any,bucket:R2Bucket|undefined){
 data.refereeUpdates={};
 data.refereesByLeague=Object.fromEntries(Object.entries(data.refereesByLeague||{}).map(([id,group])=>[id,normalizeRefereeSeason(group)]));
 await Promise.all(data.leagues.map(async(l:any)=>{
  const update=await readCache(bucket,refereeUpdateKey(l.id));if(!update)return;
  const {matches,stats,...status}=update;data.refereeUpdates[l.id]={...status,persisted:true};
  if(stats&&(newer(stats.checkedAt,data.refereesByLeague?.[l.id]?.checkedAt)||stats.checkedAt&&stats.checkedAt===data.refereesByLeague?.[l.id]?.checkedAt))data.refereesByLeague[l.id]=normalizeRefereeSeason(stats);
 }));
 return data;
}

export async function attachRefereeUpdates(events:any[],bucket:R2Bucket|undefined){
 const advanceWork=Promise.all([...new Set(events.map(e=>e.league))].map(async league=>[league,await getAdvanceOfficials(league,bucket)] as const));
 const dfb=events.some(e=>e.league==='bundesliga')?await getDFBOfficials(bucket):null;
 const uefa=events.some(e=>e.league==='ucl')?await getUEFAOfficials(bucket):null;
 const official=events.some(plMatch)?await getPLOfficials(bucket):null;
 const updates=new Map<string,any>();
 await Promise.all([...new Set(events.map(e=>e.league))].map(async league=>{
  const saved=await readCache(bucket,refereeUpdateKey(league));
  for(const match of saved?.matches||[])updates.set(`${league}:${match.id}`,match);
 }));
 const enriched=events.map(event=>{
  const update=updates.get(`${event.league}:${event.id}`);if(!update)return event;
  const result=withAppointment(event,update);
  result.appointmentLastAttempt=update.lastAttemptAt||update.fetchedAt;
  return result;
 });
 const advance=new Map(await advanceWork);
 return (official?enriched.map(event=>applyPLOfficials(event,official)):enriched).map(e=>{const m=applyCurrentAppointment(uefa?applyUEFAOfficials(e,uefa):e);return applyAdvanceOfficials(dfb?applyDFBOfficials(m,dfb):m,advance.get(e.league))});
}
