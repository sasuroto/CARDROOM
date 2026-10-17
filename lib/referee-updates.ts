import {readCache} from './cache';
import {withAppointment} from './fixture-display';
import {plMatch,getPLOfficials,applyPLOfficials} from './pl-officials';

export const REFEREE_INTERVAL=60*60*1000;
export const refereeUpdateKey=(league:string)=>`referee-updates/v1/${league}.json`;
const newer=(a?:string,b?:string)=>Date.parse(a||'')> (Date.parse(b||'')||0);

export async function mergeRefereeUpdates(data:any,bucket:R2Bucket|undefined){
 data.refereeUpdates={};
 await Promise.all(data.leagues.map(async(l:any)=>{
  const update=await readCache(bucket,refereeUpdateKey(l.id));if(!update)return;
  const {matches,stats,...status}=update;data.refereeUpdates[l.id]=status;
  if(stats&&newer(stats.checkedAt,data.refereesByLeague?.[l.id]?.checkedAt))data.refereesByLeague[l.id]=stats;
 }));
 return data;
}

export async function attachRefereeUpdates(events:any[],bucket:R2Bucket|undefined){
 const official=events.some(plMatch)?await getPLOfficials(bucket):null;
 const updates=new Map<string,any>();
 await Promise.all([...new Set(events.map(e=>e.league))].map(async league=>{
  const saved=await readCache(bucket,refereeUpdateKey(league));
  for(const match of saved?.matches||[])updates.set(`${league}:${match.id}`,match);
 }));
 const enriched=events.map(event=>{
  const update=updates.get(`${event.league}:${event.id}`);if(!update)return event;
  const sameConfirmation=update.appointmentCheckedAt===event.appointmentCheckedAt;
  const result=(!event.referee||newer(update.appointmentCheckedAt,event.appointmentCheckedAt)||sameConfirmation)?withAppointment(event,update):{...event};
  result.appointmentLastAttempt=update.lastAttemptAt||update.fetchedAt;
  return result;
 });
 return official?enriched.map(event=>applyPLOfficials(event,official)):enriched;
}
