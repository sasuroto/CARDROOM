import {env} from 'cloudflare:workers';
import {LEAGUES,espn} from '../../../lib/fixtures';
import {readCache,writeCache} from '../../../lib/cache';
import {cachedLeagueData,LEAGUE_DATA_TTL,validSeason} from '../../../lib/league-data-cache';
import {loadLeagueTable} from '../../../lib/league-table';
import {applyTeamDetails,parseTeamSchedule,selectTeamHistory,type TeamProfile} from '../../../lib/team-history';
export const dynamic='force-dynamic';
const DETAIL_LIMIT=12;
export async function GET(req:Request){
 const q=new URL(req.url).searchParams,league=q.get('league')||'',id=q.get('id')||'',season=validSeason(q.get('season'));
 if(!LEAGUES[league]||!/^\d{1,10}$/.test(id)||season===null)return Response.json({error:'Некорректная команда, турнир или сезон'},{status:400});
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET,source=`https://www.espn.com/soccer/team/results/_/id/${id}/league/${LEAGUES[league]}/season/${season}`;
 const empty=():TeamProfile=>({league,season,seasonLabel:`${season}/${String(season+1).slice(-2)}`,team:null,events:[],checkedAt:null,source,errors:[],coverage:{completed:0,withDetails:0,detailLimit:DETAIL_LIMIT}});
 const result=await cachedLeagueData<TeamProfile>(bucket,`team-profile/v1/${league}/${season}/${id}.json`,LEAGUE_DATA_TTL,async()=>{
  const table=await loadLeagueTable(bucket,league,season);
  if(!table.teams.some(t=>t.id===id))throw Error('Команда не подтверждена в турнире и сезоне');
  const errors:string[]=[],docs=await Promise.allSettled([false,true].map(async future=>{
   const key=`team-schedule/v1/${league}/${season}/${id}/${future?'fixtures':'results'}.json`;
   return cachedLeagueData<{data:ReturnType<typeof parseTeamSchedule>|null;checkedAt:string|null}>(bucket,key,LEAGUE_DATA_TTL,async()=>({data:parseTeamSchedule(await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[league]}/teams/${id}/schedule?season=${season}${future?'&fixture=true':''}`),league,id,season),checkedAt:new Date().toISOString()}),()=>({data:null,checkedAt:null}));
  }));
  const events=new Map<string,any>();let team:TeamProfile['team']=null;let scheduleStale=false;
  docs.forEach((r,i)=>{if(r.status==='fulfilled'&&r.value.data){team=team||r.value.data.team;for(const e of r.value.data.events)events.set(e.id,{...e,checkedAt:r.value.checkedAt,stale:!!r.value.stale});if(r.value.stale){errors.push(i?'fixtures-stale':'results-stale');scheduleStale=true}}else{errors.push(i?'fixtures':'results');scheduleStale=true}});
  if(!team)throw Error('Источник команды недоступен');
  const history=selectTeamHistory([...events.values()],{limit:'all',venue:'all'});
  const cached=await Promise.all(history.map(async event=>({event,saved:await readCache(bucket,`history/v1/${league}/${event.id}.json`)})));
  let remaining=DETAIL_LIMIT;
  const jobs=cached.map(({event,saved})=>({event,saved,fetch:!(saved?.data&&Date.now()-Date.parse(saved.checkedAt)<86400000)&&remaining-->0}));
  // Reuse already collected match summaries; at most twelve new source requests.
  for(let start=0;start<jobs.length;start+=4)await Promise.allSettled(jobs.slice(start,start+4).map(async({event,saved,fetch:shouldFetch})=>{
   try{
    if(saved?.data&&Date.now()-Date.parse(saved.checkedAt)<86400000){events.set(event.id,applyTeamDetails(event,saved.data,season,saved.checkedAt));return}
    if(!shouldFetch){if(saved?.data)events.set(event.id,{...applyTeamDetails(event,saved.data,season,saved.checkedAt),detailsStale:true});return}
    const data=await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[league]}/summary?event=${event.id}`),checkedAt=new Date().toISOString(),compact=applyTeamDetails(event,data,season,checkedAt);
    events.set(event.id,compact);await writeCache(bucket,`history/v1/${league}/${event.id}.json`,{data,checkedAt});
   }catch{errors.push('details:'+event.id);if(saved?.data){try{events.set(event.id,{...applyTeamDetails(event,saved.data,season,saved.checkedAt),detailsStale:true})}catch{/* retain source schedule score */}}}
  }));
  const list=[...events.values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  return{...empty(),team,events:list,checkedAt:new Date().toISOString(),errors,coverage:{completed:history.length,withDetails:list.filter(e=>e.state==='post'&&e.detailsAvailable).length,detailLimit:DETAIL_LIMIT},...(scheduleStale?{stale:true}:{})};
 },empty);
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}
