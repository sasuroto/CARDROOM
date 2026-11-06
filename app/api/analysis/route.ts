import {recordAnalysis} from '../../../lib/results-journal';
import {savedAnalysis} from '../../../lib/analysis-fallback';
import {readCache,writeCache} from '../../../lib/cache';
import {env} from 'cloudflare:workers';
import {LEAGUES,espn} from '../../../lib/fixtures';
import {HISTORY_LIMIT,compactMatch,historyCandidates,buildHistory,playerCandidates,compactLineups} from '../../../lib/match-analysis';
export const dynamic='force-dynamic';
export async function GET(req:Request){const q=new URL(req.url).searchParams,id=q.get('id')||'',league=q.get('league')||'';if(!/^\d{5,12}$/.test(id)||!LEAGUES[league])return Response.json({error:'Некорректный матч'},{status:400});
 const db=(env as unknown as {DB?:D1Database}).DB;
 const respond=async(value:any)=>Response.json({...value,journal:await recordAnalysis(db,bucket,id,league,value)},{headers:{'Cache-Control':'no-store'}});
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET,key=`analysis/v11/${league}/${id}.json`;let cached:any=null;
 {cached=await readCache(bucket,key);const ttl=cached?.state==='in'?60000:300000;if(cached&&Date.now()-Date.parse(cached.checkedAt)<ttl)return respond(cached)}
 try{const d=await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[league]}/summary?event=${id}`,bucket),base=compactMatch(d),schedules:Record<string,any>={},errors:string[]=[];
 await Promise.allSettled(historyCandidates(d).map(async(t:any)=>{try{const k=`schedule/v1/${league}/${d.header.season.year}/${t.id}.json`,saved=await readCache(bucket,k);if(saved){if(saved.data&&Date.now()-Date.parse(saved.checkedAt)<3600000){schedules[t.id]=saved.data;return}}
 const schedule=await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[league]}/teams/${t.id}/schedule?season=${d.header.season.year}`,bucket);if(String(schedule.team?.id)!==t.id||!Array.isArray(schedule.events))throw Error('Некорректная история команды');schedules[t.id]=schedule;await writeCache(bucket,k,{data:schedule,checkedAt:new Date().toISOString()});}catch{errors.push('schedule:'+t.id)}}));
 if(base.teams.length!==2||!base.date)throw Error('Некорректный ответ матча');
 if(String(d.header?.id??d.header?.competitions?.[0]?.id)!==id||d.header?.league?.slug!==LEAGUES[league])throw Error('Источник вернул другой матч или турнир');
 const candidates=historyCandidates(d,schedules),ids=[...new Set<string>(candidates.flatMap((t:any)=>t.events.map((e:any)=>String(e.id))))].slice(0,HISTORY_LIMIT*2),docs:Record<string,any>={},historyCheckedAt:Record<string,string>={};
 for(let i=0;i<ids.length;i+=4)await Promise.allSettled(ids.slice(i,i+4).map(async event=>{try{const k=`history/v1/${league}/${event}.json`,saved=await readCache(bucket,k);if(saved){if(saved.data&&Date.now()-Date.parse(saved.checkedAt)<86400000&&Date.parse(saved.checkedAt)<=Date.now()){docs[event]=saved.data;historyCheckedAt[event]=saved.checkedAt;return}}const x=await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[league]}/summary?event=${event}`,bucket);if(String(x.header?.id??x.header?.competitions?.[0]?.id)!==event||x.header?.league?.slug!==LEAGUES[league]||x.header?.competitions?.[0]?.status?.type?.state!=='post')throw Error();docs[event]=x;historyCheckedAt[event]=new Date().toISOString();await writeCache(bucket,k,{data:x,checkedAt:historyCheckedAt[event]})}catch{errors.push(event)}}));
 const history=buildHistory(d,docs,schedules).map((team:any)=>({...team,events:team.events.map((e:any)=>({...e,checkedAt:historyCheckedAt[e.id]}))}));
 const result={...base,history,players:playerCandidates(d,docs),lineups:compactLineups(d),errors,checkedAt:new Date().toISOString(),source:`https://www.espn.com/soccer/match/_/gameId/${id}`};await writeCache(bucket,key,result);return respond(result)
 }catch{const fallback=cached||savedAnalysis(id,league);return Response.json(fallback?{...fallback,stale:true}:{error:'Источник статистики матча недоступен',history:[],players:[],teams:[]})}
}
