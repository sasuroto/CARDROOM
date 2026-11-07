import {LEAGUES} from './fixtures';
import {inspectCache} from './cache';
import {withAppointment} from './fixture-display';
import {normalizeRefereeSeason} from './referee-season';
import {forecastSnapshot,resultObservation,evaluatePick,summarizeResults,journalDay,matchKey,JOURNAL_START} from './results-model';

const utcNow="strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const fail={status:'unavailable',persisted:false,error:'Запись журнала не подтверждена'};
const eligible=(m:any)=>LEAGUES[m?.league]&&Number.isFinite(Date.parse(m.date))&&Math.abs(Date.parse(m.date)-Date.now())<=7*86400000;
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function saveForecast(db:D1Database,snapshot:any){
 const key=matchKey(snapshot.league,snapshot.id),payload=JSON.stringify(snapshot);
 if(payload.length>131072)return {status:'too-large',persisted:false};
 await db.prepare(`INSERT OR IGNORE INTO journal_forecasts (match_key,league,day,committed_at,payload) SELECT ?,?,?,${utcNow},? WHERE ${utcNow} < ?`).bind(key,snapshot.league,journalDay(snapshot.kickoff),payload,snapshot.kickoff).run();
 const row=await db.prepare('SELECT committed_at,payload FROM journal_forecasts WHERE match_key=?').bind(key).first<any>();
 if(!row)return {status:'not-recorded',persisted:false,reason:'Матч уже начался'};
 const saved=JSON.parse(row.payload);
 if(!(Date.parse(row.committed_at)<Date.parse(saved.kickoff)))return fail;
 return {status:row.payload===payload?'forecast-recorded':'forecast-existing',persisted:true,committedAt:row.committed_at,modelVersion:saved.modelVersion,picks:saved.picks.length};
}
export async function saveObservation(db:D1Database,observation:any){
 const {checkedAt,...facts}=observation,key=matchKey(observation.league,observation.id),hash=await digest(JSON.stringify(facts)),id=await digest(key+observation.kind+checkedAt+hash);
 // A single conditional INSERT is atomic. Equal/older or unchanged reports are not revisions.
 await db.prepare(`INSERT OR IGNORE INTO journal_observations (id,match_key,league,day,kind,observed_at,checked_at,digest,payload)
 SELECT ?,?,?,?,?,${utcNow},?,?,? WHERE NOT EXISTS (SELECT 1 FROM journal_observations WHERE match_key=? AND kind=? AND checked_at>=?)
 AND COALESCE((SELECT digest FROM journal_observations WHERE match_key=? AND kind=? ORDER BY checked_at DESC,observed_at DESC LIMIT 1),'')<>?`).bind(id,key,observation.league,journalDay(observation.kickoff),observation.kind,checkedAt,hash,JSON.stringify(observation),key,observation.kind,checkedAt,key,observation.kind,hash).run();
 const row=await db.prepare('SELECT digest,checked_at FROM journal_observations WHERE match_key=? AND kind=? ORDER BY checked_at DESC,observed_at DESC LIMIT 1').bind(key,observation.kind).first<any>();
 if(!row)return fail;
 return row.digest===hash?{status:'result-recorded',persisted:true,checkedAt:row.checked_at}:{status:'older-result-ignored',persisted:true,checkedAt:row.checked_at};
}
export async function recordCalendar(db:D1Database|undefined,events:any[]){
 if(!db)return {status:'unconfigured',persisted:false};
 let recorded=0,ignored=0;
 try{for(const event of events.slice(0,150)){
  if(!eligible(event)){ignored++;continue}
  const o=resultObservation({...event,source:event.statusSource},'score');
  if(!o){ignored++;continue}
  const ack=await saveObservation(db,o);if(!ack.persisted)return fail;recorded++;
 }return {status:'verified',persisted:true,recorded,ignored,limited:events.length>150}}
 catch{return fail}
}
export async function recordAnalysis(db:D1Database|undefined,bucket:R2Bucket|undefined,id:string,league:string,analysis:any){
 if(!db)return {status:'unconfigured',persisted:false};
 const h=analysis.teams?.find((t:any)=>t.side==='home'),a=analysis.teams?.find((t:any)=>t.side==='away');
 let match:any={...analysis,id,league,home:h?.name,away:a?.name};
 if(!eligible(match)||analysis.stale)return {status:'not-eligible',persisted:false};
 try{
  const result=resultObservation(match,'analysis');if(result)return await saveObservation(db,result);
  if(analysis.state!=='pre')return {status:'not-eligible',persisted:false};
  const summary=await inspectCache(bucket,'cardroom/data-v1.json');
  if(summary.status==='error'||summary.status==='unconfigured')return fail;
  const data=summary.value;
  if(!Array.isArray(data?.leagues))return {status:'not-eligible',persisted:false,reason:'Нет сохранённой сводки'};
  const stored=await inspectCache(bucket,`referee-updates/v1/${league}.json`);if(stored.status==='error')return fail;
  const report=stored.value,appointment=report?.matches?.find((m:any)=>String(m.id)===id&&Date.parse(m.date)===Date.parse(analysis.date));
  if(appointment)match=withAppointment(match,appointment);
  if(report?.stats){data.refereesByLeague={...data.refereesByLeague,[league]:normalizeRefereeSeason(report.stats)}}
  const snapshot=forecastSnapshot(match,analysis,data);
  return snapshot?await saveForecast(db,snapshot):{status:'not-eligible',persisted:false,reason:'Недостаточно свежих сопоставимых данных до начала матча'};
 }catch{return fail}
}
export function resultsQuery(url:string,now=Date.now()){
 const q=new URL(url).searchParams,today=journalDay(new Date(now).toISOString());
 if([...q.keys()].some(k=>!['from','to','league'].includes(k)))throw Error('Неизвестный параметр');
 const to=q.get('to')||today,from=q.get('from')||journalDay(new Date(now-6*86400000).toISOString()),league=q.get('league')||'all';
 const valid=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 if(!valid(from)||!valid(to)||from>to||Date.parse(to)-Date.parse(from)>30*86400000||from<'2025-01-01'||to>'2028-12-31'||(league!=='all'&&!LEAGUES[league]))throw Error('Укажите период до 31 дня и подключённый турнир');
 return {from,to,league};
}
export async function readJournal(db:D1Database,period:{from:string;to:string;league:string}){
 const {from,to,league}=period;
 const keys=await db.prepare(`SELECT match_key FROM (SELECT match_key,day,league FROM journal_forecasts UNION SELECT match_key,day,league FROM journal_observations) WHERE day>=? AND day<=? AND (?='all' OR league=?) GROUP BY match_key ORDER BY MAX(day) DESC,match_key LIMIT 201`).bind(from,to,league,league).all<any>();
 const selected=keys.results.slice(0,200).map(x=>x.match_key),forecasts:any[]=[],observations:any[]=[];
 // At most 80 bindings per query, below D1's parameter limit.
 for(let i=0;i<selected.length;i+=80){const batch=selected.slice(i,i+80),marks=batch.map(()=>'?').join(',');
  const f=await db.prepare(`SELECT * FROM journal_forecasts WHERE match_key IN (${marks})`).bind(...batch).all<any>();forecasts.push(...f.results);
  const o=await db.prepare(`SELECT * FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY match_key,kind ORDER BY checked_at DESC,observed_at DESC) AS rank,COUNT(*) OVER(PARTITION BY match_key,kind) AS revisions FROM journal_observations WHERE match_key IN (${marks})) WHERE rank=1`).bind(...batch).all<any>();observations.push(...o.results);
 }
 const rows=selected.map(key=>{
  const record=forecasts.find(f=>f.match_key===key),f=record?JSON.parse(record.payload):null,records=observations.filter(o=>o.match_key===key),obs=records.map(o=>JSON.parse(o.payload)).sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt)),latest=obs[0];
  const identity=f||latest;
  const detail=obs.find(o=>o.kind==='analysis'&&o.kickoff===latest?.kickoff&&o.home===latest?.home&&o.away===latest?.away&&o.homeStats.goals===latest?.homeStats.goals&&o.awayStats.goals===latest?.awayStats.goals);
  return {key,id:identity.id,league:identity.league,kickoff:identity.kickoff,home:identity.home,away:identity.away,committedAt:record?.committed_at||null,modelVersion:f?.modelVersion||null,evidence:f?.evidence||[],result:latest||null,resultDetails:detail||null,corrections:records.reduce((n,o)=>n+Math.max(0,o.revisions-1),0),picks:(f?.picks||[]).map((p:any)=>({...p,outcome:evaluatePick(f,p,obs)}))};
 });
 const first=await db.prepare('SELECT MIN(at) AS first FROM (SELECT MIN(committed_at) AS at FROM journal_forecasts UNION ALL SELECT MIN(observed_at) AS at FROM journal_observations)').first<any>();
 return {status:'ok',schemaVersion:1,captureStarted:JOURNAL_START,firstRecordedAt:first?.first||null,period,truncated:keys.results.length>200,limit:200,coverage:'observed-only',matches:rows.length,withForecast:rows.filter(r=>r.committedAt).length,withResult:rows.filter(r=>r.result).length,totals:summarizeResults(rows),dot:summarizeResults(rows,true),rows};
}
