import {readCache,writeCache} from './cache';
import {LEAGUES,fixture,localDay} from './fixtures';
import {parseReferees,parseSoccerbase} from './referee-parser';
import {clean} from './data';
import seeds from './referees.json';
import {REFEREE_INTERVAL,refereeUpdateKey} from './referee-updates';
import {GET as getMatch} from '../app/api/match/route';

// Fixed upstream sources only: callers cannot upload data, URLs, dates or credentials.
// The hourly key limits reads/writes; a rolling cursor bounds each league to 24 summaries.
const MAX_MATCHES=24;
const running=new Map<string,Promise<any>>();
export async function hourlySource(bucket:R2Bucket,url:string){
 const host=new URL(url).hostname,key=`referee-updates/source-backoff/${host}.json`,backoff=await readCache(bucket,key);
 if(backoff?.until>Date.now())throw Error(`Источник ограничил запросы; повтор после ${new Date(backoff.until).toISOString()}`);
 const response=await fetch(url,{signal:AbortSignal.timeout(16000),headers:{Accept:url.includes('site.api.espn.com')?'application/json':'text/html'}});
 if(response.status===429){
  const retry=response.headers.get('Retry-After'),seconds=Number(retry);
  const until=retry?(Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(retry)):0;
  await writeCache(bucket,key,{until:Math.max(Date.now()+REFEREE_INTERVAL,until||0)});
 }
 if(!response.ok)throw Error('HTTP '+response.status);
 return response;
}

export function refereeWindow(now=new Date()){
 const from=localDay(now.toISOString()),end=new Date(from+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);
 const until=end.toISOString().slice(0,10),prev=new Date(Date.parse(from)-86400000).toISOString().slice(0,7);
 const month=new Date(prev+'-01T12:00:00Z'),queries:string[]=[];
 while(month.toISOString().slice(0,7)<=until.slice(0,7)){queries.push(month.toISOString().slice(0,7).replace('-',''));month.setUTCMonth(month.getUTCMonth()+1)}
 return {from,until,queries};
}

export async function refreshLeagueReferees(league:string,bucket:R2Bucket|undefined){
 if(!LEAGUES[league])throw Error('Неизвестный турнир');
 if(!bucket)throw Error('Постоянное хранилище недоступно');
 const existing=running.get(league);if(existing)return existing;
 const job=refresh(league,bucket);running.set(league,job);
 try{return await job}finally{running.delete(league)}
}

async function refresh(league:string,bucket:R2Bucket){
 const key=refereeUpdateKey(league),cached=await readCache(bucket,key);
 if(cached&&Date.now()-Date.parse(cached.startedAt)<REFEREE_INTERVAL)return {...cached,cached:true,persisted:true};
 const startedAt=new Date(Date.now()).toISOString(),deadline=Date.now()+45000,window=refereeWindow(),errors:string[]=[],config=(seeds as any)[league];
 const legacy=await readCache(bucket,'cardroom/data-v1.json');
 const options=[config,cached?.stats,legacy?.refereesByLeague?.[league]].filter(Boolean).sort((a,b)=>Date.parse(b.checkedAt||'')-Date.parse(a.checkedAt||''));
 let stats=structuredClone(options[0]),statsStatus='unavailable',events:any[]=[];
 // Footiqo's shared table does not provide a verified tournament/season parser yet.
 if(league==='primeira'){statsStatus='snapshot';errors.push('Статистика Primeira Liga: сохранённый срез; автоматическая проверка турнира и сезона не подключена.')}
 else try{
  const html=await(await hourlySource(bucket,config.source)).text();
  if(!/2026\s*\/\s*(?:20)?27/.test(clean(html)))throw Error('Сезон 2026/27 не подтверждён');
  const rows=league==='epl'?parseSoccerbase(html):parseReferees(html,league==='bundesliga',200);
  if(rows.length<(stats.rows?.length||0)||rows.some(r=>{const old=stats.rows?.find((v:any)=>v.name===r.name);return old&&r.n<old.n}))throw Error('Уменьшилась выборка судей');
  stats={...stats,rows,source:config.source,checkedAt:new Date(Date.now()).toISOString(),refreshError:null,periodLabel:(config.periodLabel||'Сезон 2026/27'),seasonConfirmed:true};statsStatus='updated';
 }catch(error){errors.push('Статистика: '+String(error));stats.refreshError=String(error)}
 for(const query of window.queries){
  try{
   const url=`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[league]}/scoreboard?dates=${query}`;
   const response:any=await(await hourlySource(bucket,url)).json();if(!Array.isArray(response.events))throw Error('Неверный календарь');
   for(const raw of response.events){const event=fixture(raw,league);if(event&&localDay(event.date)>=window.from&&localDay(event.date)<=window.until&&!events.some(e=>e.id===event.id))events.push(event)}
  }catch(error){errors.push('Календарь: '+String(error))}
 }
 if(!events.length&&errors.some(e=>e.startsWith('Календарь:')))events=(cached?.matches||[]).filter((e:any)=>localDay(e.date)>=window.from&&localDay(e.date)<=window.until);
 events.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 const old=new Map<string,any>((cached?.matches||[]).map((m:any)=>[m.id,m]));
 const priority=[...events].sort((a,b)=>{
  const at=Date.parse(old.get(a.id)?.lastAttemptAt||old.get(a.id)?.fetchedAt||'')||0,bt=Date.parse(old.get(b.id)?.lastAttemptAt||old.get(b.id)?.fetchedAt||'')||0;
  return at-bt||Date.parse(a.date)-Date.parse(b.date);
 }).slice(0,MAX_MATCHES);
 const results=new Map<string,any>();
 for(const event of priority){
  if(Date.now()>deadline){errors.push('Назначения: лимит времени проверки; оставшиеся матчи переходят в следующий проход.');break}
  const backoff=await readCache(bucket,'referee-updates/source-backoff/site.api.espn.com.json');
  if(backoff?.until>Date.now()){errors.push('Назначения: источник ограничил запросы; остальные проверки отложены.');break}
  const result:any=await(await getMatch(new Request(`https://cardroom.invalid/api/match?league=${league}&id=${event.id}`))).json();
  const match={...event,...result,id:event.id,league,lastAttemptAt:result.lastAttemptAt||new Date(Date.now()).toISOString()};results.set(event.id,match);
  if(result.error)errors.push(`${event.id}: ${result.error}`);
  if(result.rateLimited){await writeCache(bucket,'referee-updates/source-backoff/site.api.espn.com.json',{until:result.retryAfter||Date.now()+REFEREE_INTERVAL});break}
 }
 const matches=events.map(e=>results.get(e.id)||{...e,...old.get(e.id),id:e.id,league});
 const report={league,runId:crypto.randomUUID(),startedAt,completedAt:new Date(Date.now()).toISOString(),nextCheckAt:new Date(Date.parse(startedAt)+REFEREE_INTERVAL).toISOString(),window:{from:window.from,until:window.until,timezone:'Asia/Tbilisi'},stats,statsStatus,statsSource:config.source,matches,coverage:{found:events.length,checked:results.size,confirmed:matches.filter(m=>m.referee&&!m.stale).length,missing:matches.filter(m=>!m.referee).length,deferred:Math.max(0,events.length-results.size)},errors};
 await writeCache(bucket,key,report);
 const saved=await readCache(bucket,key);if(saved?.runId!==report.runId)throw Error('Результат проверки не подтверждён в постоянном хранилище');
 return {...report,cached:false,persisted:true};
}
