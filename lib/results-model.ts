import {buildMarkets,PRIMARY_MARKETS,SCENARIO_MODEL_VERSION} from './scenario-model';
import {dotEvidenceFresh,dotFresh,dotSelection} from './dot-predict';
import {refereeEvidence} from './referee-evidence';
import {readableScenario} from './readable-markets';
export const JOURNAL_START='2026-11-06';
const metrics=['goals','corners','yellow','shots','target','fouls','offsides','saves','red'];
const num=(v:any)=>typeof v==='number'&&Number.isInteger(v)&&v>=0?v:null;
const score=(v:any)=>v!==null&&v!==undefined&&String(v).trim()!==''&&/^\d{1,3}$/.test(String(v))?Number(v):null;
const stamp=(s:any,now:number)=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&Date.parse(s)<=now;
export const journalDay=(date:string)=>new Date(Date.parse(date)+4*3600000).toISOString().slice(0,10);
export const matchKey=(league:string,id:string)=>`${league}:${id}`;
const identity=(m:any)=>/^\d{5,12}$/.test(String(m?.id))&&typeof m?.league==='string'&&typeof m?.home==='string'&&typeof m?.away==='string'&&m.home.trim().length>0&&m.away.trim().length>0&&m.home!==m.away&&m.home.length<=200&&m.away.length<=200&&Number.isFinite(Date.parse(m.date));
export function forecastSnapshot(match:any,analysis:any,data:any,now=Date.now()){
 if(!identity(match)||analysis?.state!=='pre'||match.state!=='pre'||analysis.statusName!=='STATUS_SCHEDULED'||!analysis.season||!Array.isArray(data?.leagues)||!dotFresh(match,analysis,'',now)||Date.parse(match.date)<=now)return null;
 const home=analysis.teams?.find((t:any)=>t.side==='home'),away=analysis.teams?.find((t:any)=>t.side==='away');
 if(!home?.id||!away?.id||home.id===away.id||home.name!==match.home||away.name!==match.away)return null;
 const markets=buildMarkets(match,analysis,data,now),ref=refereeEvidence(match,data.refereesByLeague?.[match.league],now);
 const dotIds=new Set(dotSelection(markets,{pre:true,fresh:true,refereeEligible:ref.eligible,now,kickoff:Date.parse(match.date)}).map(m=>m.id));
 const evidence:any[]=[];
 const picks=markets.filter(m=>PRIMARY_MARKETS.includes(m.id)&&m.p!==null&&m.p>0&&m.p<1&&m.choice&&m.param&&[m.param.nH,m.param.nA].every(n=>Number.isInteger(n)&&n>=3)&&dotEvidenceFresh(m.param.evidence,now,Date.parse(match.date))).map(m=>{
  const p=m.param!;const refs=p.evidence.map(e=>{let i=evidence.findIndex(x=>x.source===e.source&&x.checkedAt===e.checkedAt);if(i<0){i=evidence.length;evidence.push(e)}return i});
  return {id:m.id,metric:m.metric,line:m.line,choice:m.choice,label:readableScenario(m,match.home,match.away),probability:m.p,dotSelected:dotIds.has(m.id),sampleHome:p.nH,sampleAway:p.nA,mean:p.mean,homeMean:p.homeMean,awayMean:p.awayMean,refereeAdjustment:p.refereeAdjustment,evidence:refs};
 });
 if(!picks.length)return null;
 return {schemaVersion:1,modelVersion:SCENARIO_MODEL_VERSION,id:String(match.id),league:match.league,kickoff:new Date(match.date).toISOString(),home:match.home,away:match.away,homeId:String(home.id),awayId:String(away.id),season:analysis.season,capturedAt:new Date(now).toISOString(),analysisCheckedAt:analysis.checkedAt,source:analysis.source,evidence,picks};
}
export function resultObservation(match:any,kind:'score'|'analysis',now=Date.now()){
 const checked=match?.statusCheckedAt||match?.checkedAt;
 if(!identity(match)||!stamp(checked,now)||now-Date.parse(checked)>30*60000||match.statusStale||match.stale||match.statusError||match.error||match.source!==`https://www.espn.com/soccer/match/_/gameId/${match.id}`)return null;
 if(match.state!=='post'&&!/CANCEL|POSTPON|SUSPEND|ABANDON/.test(match.statusName||''))return null;
 if(match.state==='post'&&Date.parse(match.date)>Date.parse(checked))return null;
 const teams=match.teams||[],h=teams.find((t:any)=>t.side==='home'),a=teams.find((t:any)=>t.side==='away');
 const homeScore=score(kind==='analysis'?h?.score:match.homeScore),awayScore=score(kind==='analysis'?a?.score:match.awayScore);
 const stats=(team:any,goals:number|null)=>Object.fromEntries(metrics.map(k=>[k,k==='goals'?goals:kind==='analysis'?num(team?.stats?.[k]):null]));
 return {schemaVersion:1,id:String(match.id),league:match.league,kickoff:new Date(match.date).toISOString(),home:match.home,away:match.away,homeId:match.homeId||h?.id||null,awayId:match.awayId||a?.id||null,kind,state:match.state,statusName:match.statusName||null,statusDetail:match.statusDetail||null,period:match.period??null,season:match.season||null,homeStats:stats(h,homeScore),awayStats:stats(a,awayScore),source:match.source,checkedAt:checked};
}
const regularFinal=(r:any)=>r?.state==='post'&&['STATUS_FULL_TIME','STATUS_FINAL'].includes(r.statusName)&&r.period===2&&!/extra|penalt|shootout|дополн|пенальти/i.test(r.statusDetail||'');
export function evaluatePick(forecast:any,pick:any,observations:any[]){
 const latest=(kind:string)=>observations.filter(o=>o.kind===kind).sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt))[0];
 const scoreRow=latest('score'),detail=latest('analysis');
 const status=[scoreRow,detail].filter(Boolean).sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt))[0];
 if(!status)return {state:'pending',reason:'Результат ещё не получен',actual:null};
 const same=(r:any)=>r&&r.kickoff===forecast.kickoff&&r.home===forecast.home&&r.away===forecast.away&&(!!r.homeId&&String(r.homeId)===forecast.homeId)&&(!!r.awayId&&String(r.awayId)===forecast.awayId);
 if(!same(status))return {state:'excluded',reason:'Изменилась дата или идентификация матча',actual:null};
 if(!regularFinal(status))return {state:'excluded',reason:'Нет подтверждённого финала основного времени',actual:null};
 const goalMarket=['result','goals','btts','home','away'].includes(pick.metric),r=goalMarket?status:detail;
 if(!r||!same(r)||!regularFinal(r))return {state:'unverified',reason:'Нет подтверждённого показателя матча',actual:null};
 // Do not combine a statistical report with a later corrected score.
 if(!goalMarket&&status!==detail&&(status.homeStats.goals!==detail.homeStats.goals||status.awayStats.goals!==detail.awayStats.goals))return {state:'unverified',reason:'Протокол не согласован с последним счётом',actual:null};
 const metric=goalMarket?'goals':pick.metric,h=num(r.homeStats?.[metric]),a=num(r.awayStats?.[metric]);
 if(h===null||a===null)return {state:'unverified',reason:'Источник не передал показатель',actual:null};
 let hit=false,actual:any=h+a;
 if(pick.metric==='result'){actual=h>a?'home':h<a?'away':'draw';hit=actual===pick.choice}
 else if(pick.metric==='btts'){actual=h>0&&a>0;hit=actual===(pick.choice==='yes')}
 else {actual=pick.metric==='home'?h:pick.metric==='away'?a:h+a;hit=pick.choice==='over'?actual>pick.line:actual<pick.line}
 return {state:hit?'hit':'miss',reason:null,actual,source:r.source,checkedAt:r.checkedAt};
}
export function summarizeResults(rows:any[],dotOnly=false){
 const totals={predictions:0,settled:0,hits:0,misses:0,pending:0,unverified:0,excluded:0,hitRate:null as number|null,brier:null as number|null};let error=0;
 const groups:Record<string,any>={};
 for(const row of rows)for(const p of row.picks||[]){
  if(dotOnly&&!p.dotSelected)continue;
  totals.predictions++;
  const group=groups[p.metric]??={metric:p.metric,settled:0,hits:0,hitRate:null};
  if(p.outcome.state==='hit'||p.outcome.state==='miss'){const hit=p.outcome.state==='hit';totals.settled++;totals[hit?'hits':'misses']++;group.settled++;group.hits+=Number(hit);error+=(p.probability-Number(hit))**2}
  else if(['pending','unverified','excluded'].includes(p.outcome.state))totals[p.outcome.state as 'pending'|'unverified'|'excluded']++;
 }
 if(totals.settled){totals.hitRate=totals.hits/totals.settled;totals.brier=error/totals.settled}
 return {...totals,byMetric:Object.values(groups).map((g:any)=>({...g,hitRate:g.settled?g.hits/g.settled:null}))};
}
