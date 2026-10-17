import {readCache,writeCache} from './cache';
import {LEAGUES} from './fixtures';
import {hourlySource} from './referee-hourly';
import {REFEREE_INTERVAL} from './referee-updates';
import {JOURNAL_START,JOURNAL_VERSION,journalKey,journalRecord,leagueJournal,mergeRecords,type JournalRecord} from './referee-journal';

// Bounded, resumable collection from fixed ESPN endpoints. Each run scans a few months of the
// scoreboard and fetches at most MAX_SUMMARIES finished-match summaries; the rest wait for the next run.
// Summaries already cached by /api/analysis (history/v1) are reused instead of being fetched again.
export const MAX_SUMMARIES=30,MAX_MONTHS=6,DEADLINE_MS=45000,SCOREBOARD_LIMIT=500;
const DAY=86400000,running=new Map<string,Promise<any>>();
const ESPN_BACKOFF='referee-updates/source-backoff/site.api.espn.com.json';
// Politeness: at least paceMs between two ESPN requests of the journal, across leagues in this isolate.
export const journalTiming={paceMs:400};
let lastRequest=0;
async function paced(bucket:R2Bucket,url:string){
 const wait=lastRequest+journalTiming.paceMs-Date.now();
 if(wait>0)await new Promise(r=>setTimeout(r,wait));
 lastRequest=Date.now();
 return hourlySource(bucket,url);
}
const base=(league:string)=>`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[league]}`;

export function journalMonths(now=new Date()){
 const out:string[]=[],m=new Date(JOURNAL_START+'T12:00:00Z');
 while(m.toISOString().slice(0,7)<=now.toISOString().slice(0,7)){out.push(m.toISOString().slice(0,7).replace('-',''));m.setUTCMonth(m.getUTCMonth()+1)}
 return out;
}
// A month is final once it ended more than two days ago: late results and postponements are settled.
const monthFinal=(month:string,now:number)=>{const end=Date.UTC(+month.slice(0,4),+month.slice(4),1);return now-end>2*DAY};
// A summary can miss officials or statistics (read right after the whistle, or not yet filled in).
// Retry up to MAX_ATTEMPTS times: hourly for a match finished in the last three days, daily otherwise.
export const MAX_ATTEMPTS=3;
export const needsRecheck=(r:JournalRecord,now:number)=>(!r.referee||r.yellow.total===null)&&(r.attempts||1)<MAX_ATTEMPTS
 &&now-Date.parse(r.checkedAt)>(Date.parse(r.checkedAt)-Date.parse(r.date)<3*DAY?REFEREE_INTERVAL:DAY);

export async function refreshRefereeJournal(league:string,bucket:R2Bucket|undefined){
 if(!LEAGUES[league])throw Error('Неизвестный турнир');
 if(!bucket)throw Error('Постоянное хранилище недоступно');
 const existing=running.get(league);if(existing)return existing;
 const job=refresh(league,bucket);running.set(league,job);
 try{return await job}finally{running.delete(league)}
}

async function refresh(league:string,bucket:R2Bucket){
 const key=journalKey(league),saved=await readCache(bucket,key);
 if(saved&&Date.now()-Date.parse(saved.startedAt)<REFEREE_INTERVAL)return {...summary(saved),cached:true,persisted:true};
 const startedAt=new Date(Date.now()).toISOString(),deadline=Date.now()+DEADLINE_MS,errors:string[]=[];
 const months:Record<string,{ids:string[],checkedAt:string,final:boolean}>={...(saved?.months||{})};
 let records:JournalRecord[]=saved?.records||[];
 // 1. Finished fixtures, month by month; final months are not scanned again.
 const toScan=journalMonths().filter(m=>!months[m]?.final).slice(0,MAX_MONTHS);
 for(const month of toScan){
  try{
   const data:any=await(await paced(bucket,`${base(league)}/scoreboard?dates=${month}&limit=${SCOREBOARD_LIMIT}`)).json();
   if(!Array.isArray(data?.events))throw Error('Неверный ответ календаря');
   const ids=data.events.filter((e:any)=>(e.status?.type?.state||e.competitions?.[0]?.status?.type?.state)==='post'&&String(e.date||'').slice(0,10)>=JOURNAL_START).map((e:any)=>String(e.id)).filter((id:string)=>/^\d{5,12}$/.test(id));
   // A shorter answer never removes matches found earlier: the month list only grows.
   const before=months[month]?.ids||[],merged=[...new Set<string>([...before,...ids])];
   if(merged.length>ids.length)errors.push(`Календарь ${month}: в ответе нет ${merged.length-ids.length} ранее найденных матч.; они сохранены.`);
   months[month]={ids:merged,checkedAt:new Date(Date.now()).toISOString(),final:monthFinal(month,Date.now())&&merged.length===ids.length};
  }catch(error){errors.push(`Календарь ${month}: ${String(error)}`);if(/ограничил|429/.test(String(error)))break}
 }
 const finished=[...new Set(Object.values(months).flatMap(m=>m.ids))];
 // 2. Missing or incomplete summaries, oldest first.
 const known=new Map(records.map(r=>[r.id,r]));
 const pending=finished.filter(id=>!known.has(id)||needsRecheck(known.get(id) as JournalRecord,Date.now()));
 const fresh:JournalRecord[]=[];let fetched=0;
 // R2 reads are bounded too: the first run of a league can see hundreds of finished matches.
 for(const id of pending.slice(0,MAX_SUMMARIES*4)){
  if(Date.now()>deadline){errors.push('Журнал: лимит времени; остальные матчи — в следующей проверке.');break}
  const cached=await readCache(bucket,`history/v1/${league}/${id}.json`),now=new Date(Date.now()).toISOString();
  let record=cached?.data?journalRecord(cached.data,league,cached.checkedAt||now):null;
  if(!record||needsRecheck(record,Date.now())){
   if(fetched>=MAX_SUMMARIES)continue;
   const backoff=await readCache(bucket,ESPN_BACKOFF);if(backoff?.until>Date.now()){errors.push('Журнал: источник ограничил запросы; остальные матчи отложены.');break}
   try{
    fetched++;record=journalRecord(await(await paced(bucket,`${base(league)}/summary?event=${id}`)).json(),league,now);
    if(!record)errors.push(`${id}: ответ не подтвердил завершённый матч турнира`);
    else{const prior=known.get(id);if(prior)record.attempts=(prior.attempts||1)+1}
   }
   catch(error){errors.push(`${id}: ${String(error)}`);if(/ограничил|429/.test(String(error)))break;continue}
  }
  if(record)fresh.push(record);
 }
 // Confirmed records are never dropped, even if a later calendar response omits the match.
 records=mergeRecords(records,fresh);
 const listed=new Set(finished),collected=records.filter(r=>listed.has(r.id)).length;
 const coverage={finished:finished.length,collected,pending:Math.max(0,finished.length-collected)};
 const report={league,version:JOURNAL_VERSION,runId:crypto.randomUUID(),startedAt,completedAt:new Date(Date.now()).toISOString(),nextCheckAt:new Date(Date.parse(startedAt)+REFEREE_INTERVAL).toISOString(),
  source:'https://www.espn.com/soccer/',period:{from:JOURNAL_START},months,records,coverage,errors};
 await writeCache(bucket,key,report);
 const check=await readCache(bucket,key);if(check?.runId!==report.runId)throw Error('Журнал не подтверждён в постоянном хранилище');
 return {...summary(report),cached:false,persisted:true};
}

// Public view of a stored journal: aggregates, coverage and dates; raw records only on request.
export function summary(report:any,withRecords=false){
 const records:JournalRecord[]=report?.records||[],coverage=report?.coverage||{finished:0,collected:records.length};
 return {league:report?.league,runId:report?.runId,startedAt:report?.startedAt,completedAt:report?.completedAt,nextCheckAt:report?.nextCheckAt,
  source:report?.source,period:report?.period,errors:report?.errors||[],...leagueJournal(records,coverage),...(withRecords?{records}:{})};
}

// ── Rotation: one league per call ─────────────────────────────────────────────
// A single scheduled URL (or a Worker cron) calls runScheduledJournal every few minutes. Each call runs
// at most one league: never-collected leagues first, then the one checked longest ago. A global gap
// between runs and the shared ESPN backoff cap the request rate across all 9 leagues.
export const SCHEDULER_KEY=`referee-journal/v${JOURNAL_VERSION}/_scheduler.json`,MIN_GAP_MS=5*60000;
export function nextLeague(states:Record<string,string|null>,now:number){
 const due=Object.keys(LEAGUES).filter(id=>!states[id]||now-Date.parse(states[id] as string)>=REFEREE_INTERVAL);
 return due.sort((a,b)=>(states[a]?Date.parse(states[a] as string):0)-(states[b]?Date.parse(states[b] as string):0))[0]||null;
}
export async function runScheduledJournal(bucket:R2Bucket|undefined){
 if(!bucket)throw Error('Постоянное хранилище недоступно');
 const now=Date.now(),scheduler=await readCache(bucket,SCHEDULER_KEY)||{};
 const backoff=await readCache(bucket,ESPN_BACKOFF);
 if(backoff?.until>now)return {status:'source-limited',nextAt:new Date(backoff.until).toISOString()};
 if(scheduler.lastRunAt&&now-Date.parse(scheduler.lastRunAt)<MIN_GAP_MS)return {status:'spacing',nextAt:new Date(Date.parse(scheduler.lastRunAt)+MIN_GAP_MS).toISOString()};
 const states:Record<string,string|null>={};
 for(const id of Object.keys(LEAGUES))states[id]=(await readCache(bucket,journalKey(id)))?.startedAt||null;
 const league=nextLeague(states,now);
 if(!league){const soonest=Math.min(...Object.values(states).map(v=>Date.parse(v as string)+REFEREE_INTERVAL));return {status:'idle',nextAt:new Date(soonest).toISOString()}}
 // Claim the slot before the run, so overlapping calls back off instead of doubling the load.
 await writeCache(bucket,SCHEDULER_KEY,{...scheduler,lastRunAt:new Date(now).toISOString(),lastLeague:league});
 try{
  const result=await refreshRefereeJournal(league,bucket);
  await writeCache(bucket,SCHEDULER_KEY,{lastRunAt:new Date(now).toISOString(),lastLeague:league,lastResult:{league,runId:result.runId,ok:true,errors:result.errors?.length||0,completedAt:result.completedAt}});
  return {status:'ran',league,runId:result.runId,coverage:result.coverage,errors:result.errors};
 }catch(error){
  await writeCache(bucket,SCHEDULER_KEY,{lastRunAt:new Date(now).toISOString(),lastLeague:league,lastResult:{league,ok:false,error:String(error)}});
  throw error;
 }
}
