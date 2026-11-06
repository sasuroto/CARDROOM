import {calendarCacheTtl} from '../../../lib/calendar-refresh';
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
 const ttl=calendarCacheTtl(cached?.events||[],date,upcoming);
 const competitionIds=league==='all'?Object.keys(LEAGUES):[league];
 const sameCoverage=league!=='all'||competitionIds.every(id=>cached?.competitionIds?.includes(id));
 if(cached&&sameCoverage&&Date.now()-Date.parse(cached.checkedAt)<ttl)return Response.json({...cached,events:await attachRefereeUpdates(cached.events||[],bucket)},{headers:{'Cache-Control':'no-store'}});
 const ids=league==='all'?Object.keys(LEAGUES):[league],events:any[]=[],errors:string[]=[],checkedAt=new Date().toISOString();
 let retryAfter=0,cooldownPersisted=true;
 const {until,queries}=calendarWindow(date,upcoming);
 const add=(f:any)=>{if(f&&inCalendarScope(f,date,until,upcoming)&&!events.some(x=>x.id===f.id))events.push(f)};
 await Promise.allSettled(ids.map(async id=>{
  const responses=await Promise.allSettled(queries.map(async requested=>{
   const d=await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[id]}/scoreboard?dates=${requested}`,bucket);
   if(!Array.isArray(d.events))throw Error('Некорректный календарь');
   for(const e of d.events){const f=fixture(e,id);if(f)add({...f,checkedAt,statusCheckedAt:checkedAt})}
  }));
  if(responses.some(r=>r.status==='rejected'))errors.push(id);
  for(const response of responses)if(response.status==='rejected'){if(response.reason?.cooldownPersisted===false)cooldownPersisted=false;const retry=Number(response.reason?.retryAfter);if(Number.isFinite(retry)&&retry>Date.now())retryAfter=Math.max(retryAfter,retry)}
 }));
 // Only failed competitions may reuse a dated fallback.
 for(const f of [...(cached?.events||[]),...snapshot.events,...research.fixtures])if(errors.includes(f.league))add({...f,stale:true,statusStale:true});
 events.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 const shownDate=upcoming&&events.length?localDay(events[0].date):date;
 const result={events:upcoming?events.filter(f=>localDay(f.date)===shownDate):events,competitionIds,errors,checkedAt,timezone:'Asia/Tbilisi',date:shownDate,upcoming,...(retryAfter?{retryAfter}: {}),...(!cooldownPersisted?{cooldownPersisted:false}:{})};
 await writeCache(bucket,key,result);return Response.json({...result,events:await attachRefereeUpdates(result.events,bucket)},{headers:{'Cache-Control':'no-store'}})
}
