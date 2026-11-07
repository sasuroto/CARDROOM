import {buildExactScore11} from './scenario-model';
import {backtest11,binaryMetrics,regularGoals,type Revision} from './exact-score-history';
import {EXACT_VERSION,POLICY} from './exact-score-model';
const nowSQL="strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const day=(s:string)=>new Date(Date.parse(s)+4*3600000).toISOString().slice(0,10);
const failure=()=>({status:'unavailable',experimental:true,reason:'Экспериментальный журнал недоступен: проверьте хранилище и миграцию journal_exact11.',journal:{persisted:false}});
function presented(saved:any,analysis:any,journal:any){
 const h=analysis.teams?.find((t:any)=>t.side==='home'),a=analysis.teams?.find((t:any)=>t.side==='away');
 const changed=Date.parse(analysis.date)!==Date.parse(saved.kickoff)||String(h?.id)!==saved.homeId||String(a?.id)!==saved.awayId||h?.name!==saved.home||a?.name!==saved.away;
 return {...saved,...(changed?{status:'fixture-changed',reason:'Матч перенесён или команды изменились. Старая запись сохранена только в журнале; к текущему матчу её оценка не применяется.',poisson:{status:'unavailable',probability:null},dc:{status:'unavailable',probability:null}}:{}),journal,display:'saved-before-kickoff'};
}
export async function loadExactHistory(db:D1Database,league:string):Promise<Revision[]>{
 const rows=await db.prepare('SELECT match_key,observed_at,payload FROM journal_observations WHERE league=? ORDER BY observed_at DESC,id DESC LIMIT 3001').bind(league).all<any>();
 if(rows.results.length>3000)throw Error('history-limit');
 return rows.results.map(r=>({key:r.match_key,availableAt:r.observed_at,observation:JSON.parse(r.payload)}));
}
export async function saveExactForecast(db:D1Database,snapshot:any){
 const payload=JSON.stringify(snapshot),key=`${snapshot.league}:${snapshot.id}`;
 if(snapshot.experiment!==EXACT_VERSION||snapshot.status!=='ok'||![snapshot.poisson?.probability,snapshot.dc?.probability].every(p=>typeof p==='number'&&Number.isFinite(p)&&p>0&&p<1)||payload.length>524288)return {status:'not-eligible',persisted:false};
 await db.prepare(`INSERT OR IGNORE INTO journal_exact11 (match_key,league,day,committed_at,payload) SELECT ?,?,?,${nowSQL},? WHERE ${nowSQL} < ? AND ? <= ${nowSQL}`).bind(key,snapshot.league,day(snapshot.kickoff),payload,snapshot.kickoff,snapshot.computedAt).run();
 const row=await db.prepare('SELECT committed_at,payload FROM journal_exact11 WHERE match_key=?').bind(key).first<any>();
 if(!row)return {status:'not-recorded',persisted:false,reason:'Старт матча уже наступил или время расчёта некорректно.'};
 const saved=JSON.parse(row.payload);if(!(Date.parse(row.committed_at)<Date.parse(saved.kickoff)))return {status:'unavailable',persisted:false};
 return {status:row.payload===payload?'forecast-recorded':'forecast-existing',persisted:true,committedAt:row.committed_at,snapshot:saved};
}
export async function exactAnalysis(db:D1Database|undefined,id:string,league:string,analysis:any,now=Date.now()){
 if(!db)return failure();
 try{
  const old=await db.prepare('SELECT committed_at,payload FROM journal_exact11 WHERE match_key=?').bind(`${league}:${id}`).first<any>();
  if(old)return presented(JSON.parse(old.payload),analysis,{status:'forecast-existing',persisted:true,committedAt:old.committed_at});
  const h=analysis.teams?.find((t:any)=>t.side==='home'),a=analysis.teams?.find((t:any)=>t.side==='away');
  if(!/^\d{5,12}$/.test(id)||!h?.id||!a?.id||String(h.id)===String(a.id)||!h.name||!a.name||analysis.source!==`https://www.espn.com/soccer/match/_/gameId/${id}`)return {...failure(),reason:'Не подтверждена идентификация матча и команд.'};
  const match={...analysis,id,league,homeId:String(h.id),awayId:String(a.id),home:h.name,away:a.name};
  let revisions:Revision[];try{revisions=await loadExactHistory(db,league)}catch(e){return {...failure(),reason:e instanceof Error&&e.message==='history-limit'?'История превышает 3000 ревизий: нужен версионированный архив для обучения без усечения.':'Не удалось прочитать историю лиги.'};}
  const estimate=buildExactScore11(revisions,match,now);
  if(estimate.status!=='ok')return {...estimate,id,league,kickoff:match.date,journal:{persisted:false,status:'not-eligible'}};
  const snapshot={...estimate,id,league,home:match.home,away:match.away,homeId:match.homeId,awayId:match.awayId,kickoff:new Date(match.date).toISOString(),policy:POLICY};
  const ack=await saveExactForecast(db,snapshot);
  const journal={status:ack.status,persisted:ack.persisted,committedAt:ack.committedAt||null};
  return ack.persisted?presented(ack.snapshot,analysis,journal):{...snapshot,journal,display:'not-saved'};
 }catch{return failure()}
}
export function exactOutcome(f:any,observations:any[]){
 const r=[...observations].sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt))[0];
 if(!r)return {state:'pending',actual:null,reason:'Результат не получен.'};
 if(r.kickoff!==f.kickoff||r.home!==f.home||r.away!==f.away||String(r.homeId)!==f.homeId||String(r.awayId)!==f.awayId)return {state:'excluded',actual:null,reason:'Дата или идентификация матча изменилась.'};
 const goals=regularGoals(r);if(!goals)return {state:'unverified',actual:null,reason:'Нет подтверждённого результата основного времени. Перенос не проигрыш.'};
 return {state:'settled',actual:Number(goals[0]===1&&goals[1]===1),homeGoals:goals[0],awayGoals:goals[1],source:r.source,checkedAt:r.checkedAt};
}
export async function readExactJournal(db:D1Database,period:{from:string;to:string;league:string}){
 try{
  const records=await db.prepare("SELECT * FROM journal_exact11 WHERE day>=? AND day<=? AND (?='all' OR league=?) ORDER BY day DESC,match_key LIMIT 201").bind(period.from,period.to,period.league,period.league).all<any>();
  const rows:any[]=[],selected=records.results.slice(0,200),observations=new Map<string,any>();
  for(let i=0;i<selected.length;i+=80){const batch=selected.slice(i,i+80).map(r=>r.match_key),marks=batch.map(()=>'?').join(',');
   const obs=await db.prepare(`SELECT match_key,payload FROM (SELECT match_key,payload,ROW_NUMBER() OVER(PARTITION BY match_key ORDER BY checked_at DESC,observed_at DESC,id DESC) AS rank FROM journal_observations WHERE match_key IN (${marks})) WHERE rank=1`).bind(...batch).all<any>();
   for(const r of obs.results)observations.set(r.match_key,JSON.parse(r.payload));
  }
  for(const record of selected){
   const f=JSON.parse(record.payload),o=observations.get(record.match_key);
   rows.push({key:record.match_key,committedAt:record.committed_at,...f,outcome:exactOutcome(f,o?[o]:[])});
  }
  const settled=rows.filter(r=>r.outcome.state==='settled'),metrics=Object.fromEntries(['poisson','dc'].map(m=>[m,binaryMetrics(settled.map(r=>({p:r[m].probability,y:r.outcome.actual})))]));
  return {status:'ok',rows,truncated:records.results.length>200,recorded:rows.length,settled:settled.length,unsettled:rows.length-settled.length,metrics,coverage:'observed-only',backup:'not-covered'};
 }catch{return {status:'unavailable',reason:'Не удалось прочитать экспериментальное расширение журнала.',rows:[],metrics:null}}
}
export async function exactValidation(db:D1Database|undefined,league:string,now=Date.now()){
 if(!db)return {status:'unavailable',reason:'Постоянный журнал не подключён.'};
 try{return {...backtest11(await loadExactHistory(db,league),league,now),league,computedAt:new Date(now).toISOString()};}
 catch(e){return {status:'unavailable',reason:e instanceof Error&&e.message==='history-limit'?'Более 3000 ревизий: проверка не выполняется на усечённой истории.':'История лиги недоступна.'}}
}
