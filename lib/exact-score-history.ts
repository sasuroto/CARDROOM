import {fitGoals,predict11,POLICY,EXACT_VERSION,MODEL_VERSIONS,type GoalGame} from './exact-score-model';
export type Revision={key:string;availableAt:string;observation:any};
const stamp=(v:any)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function regularGoals(o:any):[number,number]|null{
 if(o?.state!=='post'||!['STATUS_FULL_TIME','STATUS_FINAL'].includes(o.statusName)||o.period!==2||/extra|penalt|shootout|дополн|пенальти/i.test(o.statusDetail||''))return null;
 const goals=[o.homeStats?.goals,o.awayStats?.goals];return goals.every(v=>Number.isInteger(v)&&v>=0&&v<=30)?goals as [number,number]:null;
}
export function historyAsOf(revisions:Revision[],league:string,cutoff:number){
 const latest=new Map<string,Revision>(),skips:Record<string,number>={};const skip=(r:string)=>{skips[r]=(skips[r]||0)+1};
 for(const r of revisions){const o=r.observation;
  if(o?.league!==league)continue;
  if(!stamp(r.availableAt)||!stamp(o.checkedAt)||Date.parse(r.availableAt)>=cutoff||Date.parse(o.checkedAt)>=cutoff){skip('notAvailableBeforeCutoff');continue}
  const old=latest.get(r.key);
  // Resolve source revisions by checked time, with actual storage time as tie-breaker.
  if(!old||o.checkedAt>old.observation.checkedAt||o.checkedAt===old.observation.checkedAt&&r.availableAt>old.availableAt)latest.set(r.key,r);
 }
 const games:GoalGame[]=[];
 for(const r of latest.values()){
  const o=r.observation,goals=regularGoals(o);
  if(!stamp(o.kickoff)||Date.parse(o.kickoff)>=cutoff||Date.parse(o.kickoff)>=Date.parse(o.checkedAt)||Date.parse(o.kickoff)>=Date.parse(r.availableAt)){skip('invalidTiming');continue}
  if(Date.parse(o.kickoff)<cutoff-POLICY.windowDays*86400000){skip('outsideWindow');continue}
  if(!/^\d{5,12}$/.test(o.id)||r.key!==`${league}:${o.id}`||o.source!==`https://www.espn.com/soccer/match/_/gameId/${o.id}`||!/^\d+$/.test(String(o.homeId))||!/^\d+$/.test(String(o.awayId))||String(o.homeId)===String(o.awayId)||!o.home||!o.away){skip('unverifiedIdentityOrSource');continue}
  if(!goals){skip('noRegularTimeResult');continue}
  games.push({key:r.key,league,homeId:String(o.homeId),awayId:String(o.awayId),home:o.home,away:o.away,kickoff:o.kickoff,availableAt:new Date(Math.max(Date.parse(r.availableAt),Date.parse(o.checkedAt))).toISOString(),source:o.source,homeGoals:goals[0],awayGoals:goals[1]});
 }
 games.sort((a,b)=>a.kickoff.localeCompare(b.kickoff)||a.key.localeCompare(b.key));
 return {games,skips,coverage:'observed-only' as const,from:games[0]?.kickoff||null,to:games.at(-1)?.kickoff||null,lastAvailableAt:games.length?games.map(g=>g.availableAt).sort().at(-1)!:null};
}
export function fitPair(games:GoalGame[]){const poisson=fitGoals(games);return {poisson,dc:poisson.status==='ok'?fitGoals(games,true,poisson):poisson};}
export function buildExactScore11(revisions:Revision[],match:any,now=Date.now()){
 const cutoff=Math.min(now,Date.parse(match.date)),history=historyAsOf(revisions,match.league,cutoff);
 const training={n:history.games.length,from:history.from,to:history.to,lastAvailableAt:history.lastAvailableAt,cutoff:new Date(Number.isFinite(cutoff)?cutoff:now).toISOString(),coverage:history.coverage,skips:history.skips,sources:[...new Set(history.games.map(g=>g.source))],requiredMatches:POLICY.minMatches};
 const base={experiment:EXACT_VERSION,experimental:true,training,computedAt:new Date(now).toISOString(),futureInputs:{xg:{status:'not-connected',reason:'Нет проверенного point-in-time xG.'},market:{status:'not-connected',reason:'Нет полного рынка точного счёта с временем котировки и маржой.'}}};
 const reason=!Number.isFinite(cutoff)||Date.parse(match.date)<=now||match.state!=='pre'||match.statusName!=='STATUS_SCHEDULED'?'Матч не подтверждён как будущий; новый прогноз не создаётся.':match.stale||match.error||!stamp(match.checkedAt)||Date.parse(match.checkedAt)>now||now-Date.parse(match.checkedAt)>15*60000?'Нет свежего подтверждения матча.':history.to&&now-Date.parse(history.to)>POLICY.maxAgeDays*86400000?'История лиги старше 30 дней.':null;
 if(reason)return {...base,status:'unavailable',poisson:{status:'unavailable',probability:null,reason},dc:{status:'unavailable',probability:null,reason}};
 const pair=fitPair(history.games),poisson=predict11(pair.poisson,String(match.homeId),String(match.awayId)),dc=predict11(pair.dc,String(match.homeId),String(match.awayId));
 return {...base,status:poisson.status==='ok'&&dc.status==='ok'?'ok':'unavailable',poisson,dc,trainingRefs:history.games.map(g=>({key:g.key,availableAt:g.availableAt,kickoff:g.kickoff,homeId:g.homeId,awayId:g.awayId,homeGoals:g.homeGoals,awayGoals:g.awayGoals})),fitAudit:pair};
}
export type Scored={p:number;y:number};
export function binaryMetrics(rows:Scored[]){
 const epsilon=1e-15,bins=Array.from({length:10},(_,i)=>({from:i/10,to:(i+1)/10,n:0,meanProbability:null as number|null,frequency:null as number|null}));
 if(!rows.length)return {n:0,brier:null,logLoss:null,ece:null,logEpsilon:epsilon,bins};
 let brier=0,logLoss=0,ece=0;
 for(const r of rows){if(!Number.isFinite(r.p)||r.p<0||r.p>1||![0,1].includes(r.y))throw Error('Invalid probability or outcome');brier+=(r.p-r.y)**2;const p=Math.max(epsilon,Math.min(1-epsilon,r.p));logLoss-=r.y*Math.log(p)+(1-r.y)*Math.log(1-p);}
 for(const b of bins){const rs=rows.filter(r=>r.p>=b.from&&(r.p<b.to||b.to===1&&r.p===1));b.n=rs.length;if(b.n){b.meanProbability=rs.reduce((s,r)=>s+r.p,0)/b.n;b.frequency=rs.reduce((s,r)=>s+r.y,0)/b.n;ece+=b.n/rows.length*Math.abs(b.meanProbability-b.frequency)}}
 return {n:rows.length,brier:brier/rows.length,logLoss:logLoss/rows.length,ece,logEpsilon:epsilon,bins};
}
export function backtest11(revisions:Revision[],league:string,now=Date.now()){
 const latest=historyAsOf(revisions,league,now),week=7*86400000,skips:Record<string,number>={},folds:any[]=[],scores={poisson:[] as Scored[],dc:[] as Scored[],baseline:[] as Scored[]};
 const end=Math.floor(now/week)*week+week,start=end-8*week,targets=latest.games.filter(g=>Date.parse(g.kickoff)>=start),audit:any[]=[];
 for(let cutoff=start;cutoff<end;cutoff+=week){
  const tests=targets.filter(g=>Date.parse(g.kickoff)>=cutoff&&Date.parse(g.kickoff)<cutoff+week);if(!tests.length)continue;
  const train=historyAsOf(revisions,league,cutoff),pair=fitPair(train.games),baseline=train.games.length?train.games.filter(g=>g.homeGoals===1&&g.awayGoals===1).length/train.games.length:null;
  let evaluated=0;
  for(const g of tests){const p=predict11(pair.poisson,g.homeId,g.awayId),d=predict11(pair.dc,g.homeId,g.awayId);let reason=p.status!=='ok'?p.reason:d.status!=='ok'?d.reason:null;
   if(train.to&&cutoff-Date.parse(train.to)>POLICY.maxAgeDays*86400000)reason='История старше 30 дней.';
   if(reason||baseline===null){const k=reason||'Нет обучающих матчей';skips[k]=(skips[k]||0)+1;continue}
   const y=Number(g.homeGoals===1&&g.awayGoals===1);scores.poisson.push({p:p.probability!,y});scores.dc.push({p:d.probability!,y});scores.baseline.push({p:baseline,y});evaluated++;
   audit.push({key:g.key,kickoff:g.kickoff,trainingCutoff:new Date(cutoff).toISOString(),maxTrainingAvailableAt:train.lastAvailableAt,trainingN:train.games.length});
  }
  folds.push({from:new Date(cutoff).toISOString(),to:new Date(Math.min(cutoff+week,now)).toISOString(),trainingN:train.games.length,trainingFrom:train.from,trainingTo:train.to,availableBefore:train.lastAvailableAt,candidates:tests.length,evaluated});
 }
 return {status:scores.poisson.length?'ok':'insufficient-data',experimental:true,versions:MODEL_VERSIONS,method:'Expanding as-of training within trailing 365 days; next 7-day block; last 8 blocks; common paired cohort',coverage:latest.coverage,historyN:latest.games.length,historyFrom:latest.from,historyTo:latest.to,candidates:targets.length,evaluated:scores.poisson.length,skipped:targets.length-scores.poisson.length,skips,excludedHistory:latest.skips,folds,audit,metrics:{poisson:binaryMetrics(scores.poisson),dc:binaryMetrics(scores.dc),baseline:binaryMetrics(scores.baseline)},winner:null,reason:scores.poisson.length?null:'Нет пригодных пар «история, доступная до игры → следующий период». Метрики не рассчитаны.'};
}
