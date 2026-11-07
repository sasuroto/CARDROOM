const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module'),{DatabaseSync}=require('node:sqlite');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const env={},load=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env}:load.call(this,id,...args)};
global.fetch=()=>{throw Error('Experimental model may not fetch providers')};
const M=require('../lib/exact-score-model.ts'),H=require('../lib/exact-score-history.ts'),J=require('../lib/exact-score-journal.ts'),I=require('../lib/exact-score-inputs.ts'),route=require('../app/api/exact-score/route.ts');
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++};
const now=Date.now(),iso=t=>new Date(t).toISOString(),DAY=86400000;
let seed=71819;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
const pois=l=>{let p=1,k=0;do{k++;p*=rand()}while(p>Math.exp(-l));return k-1};
// Synthetic statistical fixtures only. Never shipped to production or claimed as live accuracy.
function fixtureGames(){const games=[];for(let cycle=0;cycle<10;cycle++)for(let h=1;h<=8;h++)for(let a=1;a<=8;a++)if(h!==a){
 const l=1.6*Math.exp((h-4.5)*.035+(a-4.5)*.02),m=1.2*Math.exp((a-4.5)*.035+(h-4.5)*.02);let x,y;do{x=pois(l);y=pois(m)}while(rand()>M.tau(x,y,l,m,-.16)/2);
 const i=games.length;games.push({key:'epl:'+(600000+i),league:'epl',homeId:String(h),awayId:String(a),home:'Team '+h,away:'Team '+a,kickoff:iso(now-(300-i/2)*DAY),availableAt:iso(now-(300-i/2)*DAY+3*3600000),source:'https://www.espn.com/soccer/match/_/gameId/'+(600000+i),homeGoals:x,awayGoals:y});
 }return games}
const games=fixtureGames(),revisions=games.map(g=>({key:g.key,availableAt:g.availableAt,observation:{id:g.key.split(':')[1],league:g.league,homeId:g.homeId,awayId:g.awayId,home:g.home,away:g.away,kickoff:g.kickoff,source:g.source,checkedAt:g.availableAt,homeStats:{goals:g.homeGoals},awayStats:{goals:g.awayGoals},state:'post',statusName:'STATUS_FULL_TIME',statusDetail:'FT',period:2}}));
check(Math.abs(M.probability11(1,1)-Math.exp(-2))<1e-14,'Poisson 1:1 formula');
check(Math.abs(M.probability11(1,1,-.1)-Math.exp(-2)*1.1)<1e-14,'DC 1:1 tau sign');
for(const args of [[0,1,0],[NaN,1,0],[1,1,2],[1,1,-2],[Infinity,1,0]])check(M.probability11(...args)===null,'invalid probabilities rejected');
let mass=0;function fact(n){let x=1;for(let i=2;i<=n;i++)x*=i;return x}
for(let x=0;x<30;x++)for(let y=0;y<30;y++)mass+=Math.exp(-2.8)*1.6**x*1.2**y/fact(x)/fact(y)*M.tau(x,y,1.6,1.2,-.16);
check(Math.abs(mass-1)<1e-12,'DC complete score distribution normalized');
const poisson=M.fitGoals(games),dc=M.fitGoals(games,true,poisson);
check(poisson.status==='ok','Poisson fit converges: '+JSON.stringify(poisson));check(dc.status==='ok','DC joint fit converges: '+JSON.stringify(dc));
check(dc.rho<-.02&&dc.rho>-.4,'rho fitted from synthetic low-score dependence, not fixed');
check(Math.abs(dc.parameters[0]-poisson.parameters[0])>1e-7,'DC joint refits goal parameters');
check(poisson.homeAdvantage>1&&poisson.homeAdvantage<2,'home advantage fitted');
check(M.fitGoals(games.slice(0,99)).status==='unavailable','minimum league history');
check(M.fitGoals(games.map(g=>({...g,homeGoals:2,awayGoals:2})),true).status==='unavailable','rho not invented when likelihood has no low scores');
check(M.fitGoals(games.map(g=>({...g,homeGoals:g.awayId==='1'?0:g.homeGoals,awayGoals:g.homeId==='1'?0:g.awayGoals}))).status==='unavailable','zero conceded means non-finite defence MLE');
check(M.fitGoals(games.filter(g=>(Number(g.homeId)<=4)!==(Number(g.awayId)<=4))).status==='unavailable','connected bipartite schedule fails rank gate');
check(M.fitGoals(games,false,undefined,0).status==='unavailable','non-convergence hidden, not percentage');
check(M.predict11(poisson,'99','1').probability===null,'unknown team');
check(M.predict11(dc,'1','2').probability>0&&M.predict11(dc,'1','2').probability<1,'DC prediction in range');
const asOf=now-60*DAY,hist=H.historyAsOf(revisions,'epl',asOf);
check(hist.games.every(g=>Date.parse(g.availableAt)<asOf&&Date.parse(g.kickoff)<asOf),'as-of cuts both result availability and kickoff');
const corrected={...revisions[0],availableAt:iso(now),observation:{...revisions[0].observation,checkedAt:iso(now),homeStats:{goals:20}}};
check(JSON.stringify(H.historyAsOf([...revisions,corrected],'epl',asOf).games)===JSON.stringify(hist.games),'future correction cannot leak');
check(H.historyAsOf(revisions,'uel',now).games.length===0,'league isolation');
const unknown={...revisions[0],observation:{...revisions[0].observation,period:null}};
check(H.historyAsOf([unknown],'epl',now).games.length===0,'unknown regular time excluded');
check(H.historyAsOf([{...revisions[0],availableAt:iso(now+DAY)}],'epl',now).games.length===0,'historical game acquired later is not available earlier');
const bt=H.backtest11(revisions,'epl',now);
check(bt.evaluated>0&&bt.metrics.poisson.n===bt.metrics.dc.n&&bt.metrics.dc.n===bt.metrics.baseline.n,'walk-forward common cohort');
check(bt.audit.every(r=>Date.parse(r.maxTrainingAvailableAt)<Date.parse(r.trainingCutoff)&&Date.parse(r.trainingCutoff)<=Date.parse(r.kickoff)),'fold audit no look-ahead');
check(H.backtest11(revisions.map(r=>({...r,availableAt:iso(now-1000)})),'epl',now).evaluated===0,'newly acquired old archive cannot fabricate historical predictions');
check(H.backtest11([],'epl',now).metrics.poisson.brier===null,'no sample means null metrics');
const metrics=H.binaryMetrics([{p:.2,y:1},{p:.3,y:0}]);check(Math.abs(metrics.brier-.365)<1e-12,'Brier correct');check(Math.abs(metrics.logLoss-(-Math.log(.2)-Math.log(.7))/2)<1e-12,'binary log loss correct');check(metrics.bins.reduce((s,b)=>s+b.n,0)===2,'calibration counts');
const target={id:'999123',league:'epl',date:iso(now+DAY),home:'Team 1',away:'Team 2',homeId:'1',awayId:'2',state:'pre',statusName:'STATUS_SCHEDULED',checkedAt:iso(now)};
const estimate=H.buildExactScore11(revisions,target,now);check(estimate.status==='ok','live pre-match estimate');
check(H.buildExactScore11(revisions,{...target,date:iso(now-1)},now).status==='unavailable','no post-kickoff computation');
check(H.buildExactScore11(revisions,{...target,stale:true},now).status==='unavailable','no stale match prediction');
check(!require('../lib/scenario-model.ts').PRIMARY_MARKETS.includes('exact11'),'not in DOT/old scenarios');
const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const db={prepare:q=>({bind(...args){return {run:async()=>sql.prepare(q).run(...args),first:async()=>sql.prepare(q).get(...args)||null,all:async()=>({results:sql.prepare(q).all(...args)})}},first:async()=>sql.prepare(q).get()||null})};
(async()=>{
 const snap={...estimate,...target,kickoff:target.date};let ack=await J.saveExactForecast(db,snap);check(ack.persisted,'SQLite timestamp-gated write readback');
 const original=sql.prepare('SELECT payload FROM journal_exact11').get().payload;
 ack=await J.saveExactForecast(db,{...snap,poisson:{...snap.poisson,probability:.99}});check(ack.status==='forecast-existing'&&sql.prepare('SELECT payload FROM journal_exact11').get().payload===original,'experiment immutable on retry');
 const moved=await J.exactAnalysis(db,snap.id,snap.league,{date:iso(now+2*DAY),teams:[{side:'home',id:'1',name:target.home},{side:'away',id:'2',name:target.away}]});check(moved.status==='fixture-changed'&&moved.poisson.probability===null,'rescheduled fixture does not display old probabilities');
 for(const [i,r] of revisions.entries())sql.prepare('INSERT INTO journal_observations (id,match_key,league,day,kind,observed_at,checked_at,digest,payload) VALUES (?,?,?,?,?,?,?,?,?)').run(String(i),r.key,'epl',r.observation.kickoff.slice(0,10),'score',r.availableAt,r.observation.checkedAt,String(i),JSON.stringify(r.observation));
 let firstRead=true;
 const racing={prepare(q){
  const statement=db.prepare(q);
  return {bind(...args){
   const bound=statement.bind(...args);
   return {...bound,first:async()=>{
    if(firstRead&&q.startsWith('SELECT committed_at,payload FROM journal_exact11')){firstRead=false;return null}
    return bound.first();
   }};
  }};
 }};
 const raceResult=await J.exactAnalysis(racing,snap.id,'epl',{...target,date:iso(now+2*DAY),source:'https://www.espn.com/soccer/match/_/gameId/'+snap.id,teams:[{side:'home',id:'1',name:target.home},{side:'away',id:'2',name:target.away}]},now);
 check(raceResult.status==='fixture-changed'&&raceResult.poisson.probability===null,'concurrent existing write also gets identity suppression');
 check(sql.prepare('SELECT payload FROM journal_exact11').get().payload===original,'concurrent path preserves original bytes');
 check(!(await J.saveExactForecast(db,{...snap,id:'999124',kickoff:iso(now-DAY)})).persisted,'SQL clock blocks retrospective write');
 check(!(await J.saveExactForecast(db,{...snap,id:'999125',computedAt:iso(now+DAY)})).persisted,'SQL clock blocks future computation');
 check(sql.prepare('SELECT COUNT(*) n FROM journal_forecasts').get().n===0,'legacy forecast table untouched');
 const result={...revisions[0].observation,homeId:'1',awayId:'2',home:target.home,away:target.away,kickoff:target.date,homeStats:{goals:1},awayStats:{goals:1}};
 check(J.exactOutcome(snap,[result]).actual===1,'1:1 settled');check(J.exactOutcome(snap,[{...result,homeStats:{goals:2}}]).actual===0,'other final settled');
 for(const patch of [{period:4},{period:null},{statusName:'STATUS_POSTPONED'},{homeStats:{goals:null}},{kickoff:iso(now+2*DAY)}])check(J.exactOutcome(snap,[{...result,...patch}]).actual===null,'unknown/postponed/extra-time not loss');
 check(J.exactOutcome(snap,[]).state==='pending','missing result pending');
 check((await J.readExactJournal(db,{from:target.date.slice(0,10),to:iso(now+2*DAY).slice(0,10),league:'all'})).recorded===1,'separate extension visible without legacy snapshot');
 const legacy=new DatabaseSync(':memory:');legacy.exec(fs.readFileSync('drizzle/0000_tough_mathemanic.sql','utf8'));check((await J.readExactJournal({prepare:()=>{throw Error('no table')}},{from:'2026-01-01',to:'2026-01-02',league:'all'})).status==='unavailable','missing migration explicit');
 check((await J.exactAnalysis(undefined,'999123','epl',{})).journal.persisted===false,'missing DB isolated');
 check((await route.GET(new Request('https://x/api/exact-score?league=epl'))).status===503,'missing DB read route');env.DB=db;
 check((await route.GET(new Request('https://x/api/exact-score?league=epl'))).status===200,'insufficient data honest 200');check((await route.GET(new Request('https://x/api/exact-score?league=epl&force=1'))).status===400,'no force or arbitrary ingestion');
 const market={matchKey:'epl:999123',kickoff:target.date,source:'https://example.org/market',bookmaker:'test-only',observedAt:iso(now-1000),quotedAt:iso(now-2000),period:'regular-time',partition:'explicit-scores-plus-complement',completeScorePartition:true,outcomes:[{id:'1:1',decimalOdds:5},{id:'all-other-scores',decimalOdds:1.1}]};
 check(I.compareExactScoreMarket(market,.2,market.matchKey,target.date,now).status==='comparison-only','market adapter de-vigs complete partition');check(I.compareExactScoreMarket({...market,completeScorePartition:false},.2,market.matchKey,target.date,now).status==='unavailable','incomplete market rejected');check(I.compareExactScoreMarket({...market,quotedAt:iso(now+1000)},.2,market.matchKey,target.date,now).status==='unavailable','future odds rejected');
 check(I.compareExactScoreMarket({...market,kickoff:'bad'},.2,market.matchKey,'bad',now).status==='unavailable','invalid market kickoff');check(I.compareExactScoreMarket({...market,outcomes:[{id:'1:1',decimalOdds:1.5},{id:'0:0',decimalOdds:1.5}]},.2,market.matchKey,target.date,now).status==='unavailable','subset cannot masquerade as complete market');
 const xg={matchKey:market.matchKey,kickoff:target.date,source:'https://example.org/xg',observedAt:iso(now-1000),publishedAt:iso(now-2000),definitionVersion:'test-v1',homeXg:1.2,awayXg:1,sampleMatches:8,periodFrom:iso(now-30*DAY),periodTo:iso(now-DAY)};check(I.validXg(xg,market.matchKey,target.date,now),'xG stage-two timestamp contract');check(!I.validXg({...xg,publishedAt:iso(now+1)},market.matchKey,target.date,now),'future xG forbidden');
 console.log(`PASS ${checks} exact-score checks; synthetic training only, rho=${dc.rho.toFixed(4)}, paired backtest N=${bt.evaluated}. Not live performance.`);
})().catch(e=>{console.error(e);process.exitCode=1});
