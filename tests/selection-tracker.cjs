const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const T=require('../lib/selection-tracker.ts');
let n=0;const check=(v,s)=>{assert.ok(v,s);n++};
const near=(a,b)=>Math.abs(a-b)<1e-9;

// Initial list: five fixtures, Bayern once with two selections, Tbilisi-agnostic UTC kickoffs.
let s=T.initialTracker();
check(s.fixtures.length===5,'five tracked fixtures');
const bayern=s.fixtures.find(f=>f.home==='Bayern Munich');
check(s.fixtures.filter(f=>T.sameTeam(f.home,'Bayern München')).length===1,'Bayern appears once');
check(s.selections.filter(x=>x.fixtureKey===bayern.key).map(x=>T.marketLabel(x.market)).join()==='П1,1X','both Bayern selections attached to one fixture');
check(T.marketLabel(s.selections[3].market)==='П2 + ТБ 1,5'&&s.selections[3].odds===2.47,'Inter win + over 1.5 at 2.47');
check(T.marketLabel(s.selections[4].market)==='П1 + ТБ 2,5'&&s.selections[4].odds===1.33,'Barcelona win + over 2.5 at 1.33');
check(s.selections.every(x=>x.stake===null),'no stake is invented');

// Duplicate protection.
let r=T.addFixture(s,{league:'bundesliga',home:'FC Bayern München',away:'Dortmund',days:['2026-10-31']});
check(r.duplicate&&r.state.fixtures.length===5,'same fixture under another spelling is not duplicated');
r=T.addFixture(s,{league:'bundesliga',home:'Bayern Munich',away:'Borussia Dortmund',days:['2027-03-01']});
check(!r.duplicate,'return fixture on another date is a different fixture');
let a=T.addSelection(s,{fixtureKey:bayern.key,market:{result:'1'},odds:1.35,stake:null});
check(!a.added&&a.reason==='duplicate','same market on same fixture rejected');
a=T.addSelection(s,{fixtureKey:bayern.key,market:{total:{side:'over',line:2.5}},odds:1.5,stake:10});
check(a.added&&a.state.selections.filter(x=>x.fixtureKey===bayern.key).length===3,'another market on same fixture allowed');
check(!T.addSelection(s,{fixtureKey:bayern.key,market:{total:{side:'over',line:2}},odds:1.5,stake:null}).added,'whole-number lines rejected (push rules not modelled)');
check(!T.addSelection(s,{fixtureKey:bayern.key,market:{result:'2'},odds:0.9,stake:null}).added,'odds must be > 1');

// Settlement.
const sel=(market,extra={})=>({id:'x',fixtureKey:'k',market,odds:1.5,stake:null,createdAt:'',...extra});
const ft=(h,a,extra={})=>({state:'post',statusName:'STATUS_FULL_TIME',homeScore:String(h),awayScore:String(a),...extra});
check(T.settleSelection(sel({result:'1'}),ft(2,1)).status==='won','P1 won');
check(T.settleSelection(sel({result:'1'}),ft(1,1)).status==='lost','P1 lost on draw');
check(T.settleSelection(sel({result:'1X'}),ft(0,0)).status==='won','1X won on draw');
check(T.settleSelection(sel({result:'2',total:{side:'over',line:1.5}}),ft(1,2)).status==='won','Inter 2-1 away: combined market won');
check(T.settleSelection(sel({result:'2',total:{side:'over',line:1.5}}),ft(0,1)).status==='lost','Inter 1-0 away: total leg fails');
check(T.settleSelection(sel({result:'1',total:{side:'over',line:2.5}}),ft(2,0)).status==='lost','Barcelona 2-0: over 2.5 fails');
check(T.settleSelection(sel({result:'1'}),{state:'in',homeScore:'3',awayScore:'0'}).status==='pending','in-play never settles');
check(T.settleSelection(sel({result:'1'}),{state:'post',statusName:'STATUS_POSTPONED'}).status==='unknown','postponed left for manual settlement');
check(T.settleSelection(sel({result:'1'}),{state:'post',statusName:'STATUS_ABANDONED',homeScore:'1',awayScore:'0'}).status==='unknown','abandoned left for manual settlement');
check(T.settleSelection(sel({result:'1'}),ft(2,1,{stale:true})).status==='unknown','stale score is not used to settle');
check(T.settleSelection(sel({result:'1'}),ft(2,1,{statusName:'STATUS_FINAL_AET'})).status==='unknown','extra time is not auto-settled');
check(T.settleSelection(sel({result:'1'}),ft('',1)).status==='unknown','missing score is not settled');
check(T.settleSelection(sel({result:'1'},{manualStatus:'void'}),ft(0,3)).status==='void','manual status wins');
check(T.settleSelection(sel({result:'1'}),undefined).status==='pending','no calendar data yet: stays pending, never settled');

// Accumulators.
let acc=T.settleAccumulator([{status:'won',odds:1.3},{status:'pending',odds:1.17}],10);
check(acc.status==='pending'&&near(acc.combined,1.521)&&near(acc.potentialReturn,15.21)&&near(acc.netProfit,5.21)&&acc.settledReturn===null,'acca with an open leg is pending, potential return shown');
check(T.settleAccumulator([{status:'won',odds:1.3},{status:'unknown',odds:1.17}],10).status==='unknown','acca with an unverified leg is not won');
check(T.settleAccumulator([{status:'lost',odds:1.3},{status:'pending',odds:1.17}],10).status==='lost','one lost leg loses the acca');
acc=T.settleAccumulator([{status:'won',odds:2},{status:'void',odds:3}],10);
check(acc.status==='won'&&near(acc.settledReturn,20)&&near(acc.settledProfit,10),'void leg counts at 1.00');
check(T.settleAccumulator([{status:'void',odds:2},{status:'void',odds:3}],10).settledReturn===10,'all-void acca returns stake');
const single=T.slipReturn([1.33],100);check(near(single.potentialReturn,133)&&near(single.netProfit,33),'single return/profit');
check(T.slipReturn([null],100).potentialReturn===null,'no odds: no return invented');

// Fixture matching and stable keys.
const events=[{id:'401874795',league:'seriea',home:'AC Milan',away:'Internazionale',date:'2026-10-31T19:45Z'},{id:'9',league:'epl',home:'Aston Villa',away:'Fulham',date:'2026-11-01T14:00Z'},{id:'10',league:'epl',home:'Fulham',away:'Aston Villa',date:'2027-04-01T14:00Z'}];
const villa=s.fixtures.find(f=>f.home==='Aston Villa');
check(T.findMatch(villa,events)?.id==='9','unresolved fixture found by teams and home/away order');
check(T.findMatch({league:'seriea',home:'Milan',away:'Inter',days:['2026-10-31']},events)?.id==='401874795','Milan/Inter aliases');
check(!T.findMatch({league:'ucl',home:'Aston Villa',away:'Fulham',days:[]},events),'other competition not matched');
const resolved=T.resolveFixture(s,villa.key,events[1]);
check(resolved.fixtures.find(f=>f.key===villa.key).espnId==='9','resolved ID attached under the same key');
check(T.resolveFixture(resolved,villa.key,events[1])===resolved,'no churn when nothing changed');

// Removal and sanitising.
const removed=T.removeFixture(s,bayern.key);
check(removed.fixtures.length===4&&!removed.selections.some(x=>x.fixtureKey===bayern.key),'removing a fixture removes its selections');
check(T.sanitizeState({version:1,fixtures:[{key:'k',league:'epl',home:'<script>',away:'B',days:['bad']}],selections:[]}).fixtures.length===0,'invalid stored fixture dropped');
check(T.sanitizeState({version:2})===null&&T.sanitizeState('x')===null,'unknown payload rejected');
const round=T.sanitizeState(JSON.parse(JSON.stringify(s)));
check(round.fixtures.length===5&&round.selections.length===6,'state survives a storage round trip');

console.log(`PASS ${n} selection-tracker assertions: initial list, duplicates, markets, settlement, postponement, accumulators, returns, matching and storage.`);
