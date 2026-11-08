import {recordCalendar} from '../../../lib/results-journal';
import {calendarCacheTtl} from '../../../lib/calendar-refresh';
import {calendarCacheUntil,runCalendarRequests} from '../../../lib/calendar-requests';
import {env} from 'cloudflare:workers';
import {LEAGUES,espn,fixture,localDay} from '../../../lib/fixtures';
import {calendarWindow,inCalendarScope} from '../../../lib/calendar-scope';
import {readCache,writeCache} from '../../../lib/cache';
import {attachRefereeUpdates} from '../../../lib/referee-updates';
import research from '../../../lib/match-research.json';
import snapshot from '../../../lib/fixture-snapshot.json';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const q=new URL(req.url).searchParams,date=q.get('date')||localDay(new Date().toISOString()),league=q.get('league')||'all',upcoming=q.get('upcoming')==='1';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<'2025-01-01'||date>'2028-12-31'||(league!=='all'&&!LEAGUES[league])||(q.has('upcoming')&&!['0','1'].includes(q.get('upcoming')!)))return Response.json({error:'Некорректная дата или турнир'},{status:400});
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET,key=`fixtures/v9/${date}/${league}/${upcoming?'next':'day'}.json`,cached=await readCache(bucket,key);
 const db=(env as unknown as {DB?:D1Database}).DB;
 const respond=async(value:any)=>Response.json({...value,journal:await recordCalendar(db,value.events||[]),events:await attachRefereeUpdates(value.events||[],bucket)},{headers:{'Cache-Control':'no-store'}});
 const ttl=calendarCacheTtl(cached?.events||[],date,upcoming);
 const competitionIds=league==='all'?Object.keys(LEAGUES):[league];
 const sameCoverage=league!=='all'||competitionIds.every(id=>cached?.competitionIds?.includes(id));
 if(cached&&sameCoverage&&Date.now()<calendarCacheUntil(cached.checkedAt,ttl,!!cached.errors?.length,cached.retryAfter))return respond(cached);
 const ids=league==='all'?Object.keys(LEAGUES):[league],events:any[]=[],errors:string[]=[],checkedAt=new Date().toISOString();
 let retryAfter=0,cooldownPersisted=true;
 const {until,queries}=calendarWindow(date,upcoming);
 const add=(f:any)=>{if(f&&inCalendarScope(f,date,until,upcoming)&&!events.some(x=>x.id===f.id))events.push(f)};
 // Give previously incomplete leagues the first opportunity on a later attempt.
 // Keep one league's dates together so bounded slow runs can complete coverage
 // for some leagues; query-major runs could leave every league incomplete forever.
 // Preserve failure order too: re-sorting against the configured list would
 // repeatedly move earlier leagues ahead of the never-reached tail.
 const failedIds:string[]=Array.isArray(cached?.errors)?cached.errors.filter((id:unknown)=>typeof id==='string'&&ids.includes(id)):[];
 const priority=[...new Set([...failedIds,...ids])];
 const jobs=priority.flatMap(id=>queries.map(requested=>({id,requested})));
 const responses=await runCalendarRequests(jobs.map(({id,requested})=>async()=>{
  const d=await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[id]}/scoreboard?dates=${requested}`,bucket);
  if(!Array.isArray(d.events))throw Error('Некорректный календарь');
  for(const e of d.events){const f=fixture(e,id);if(f)add({...f,checkedAt,statusCheckedAt:checkedAt})}
 }));
 for(const [index,response] of responses.entries())if(response.status==='rejected'){
  if(!errors.includes(jobs[index].id))errors.push(jobs[index].id);
  if(response.reason?.cooldownPersisted===false)cooldownPersisted=false;
  const retry=Number(response.reason?.retryAfter);if(Number.isFinite(retry)&&retry>Date.now())retryAfter=Math.max(retryAfter,retry);
 }
 // A malformed/failed provider response is not coverage, but it did get a turn.
 // Never-dispatched leagues must lead the next retry even if every attempted
 // league also failed. This metadata is owned by the scheduler, not the provider.
 const undispatched=new Set(responses.flatMap((response,index)=>response.dispatched?[]:[jobs[index].id]));
 errors.sort((a,b)=>Number(undispatched.has(b))-Number(undispatched.has(a)));
 // Only failed competitions may reuse a dated fallback.
 for(const f of [...(cached?.events||[]),...snapshot.events,...research.fixtures])if(errors.includes(f.league))add({...f,stale:true,statusStale:true});
 events.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 const shownDate=upcoming&&events.length?localDay(events[0].date):date;
 const result={events:upcoming?events.filter(f=>localDay(f.date)===shownDate):events,competitionIds,errors,checkedAt,timezone:'Asia/Tbilisi',date:shownDate,upcoming,...(retryAfter?{retryAfter}: {}),...(!cooldownPersisted?{cooldownPersisted:false}:{})};
 await writeCache(bucket,key,result);return respond(result)
}
