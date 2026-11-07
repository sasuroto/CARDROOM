const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {matchTtl}=require('../lib/referee-authority.ts'),{panelStatus,KICKOFF_ACTIVE_WINDOW,nextDelay,POLL}=require('../lib/match-status.ts');
const kickoff=Date.parse('2026-11-02T17:30:00Z'),fixture={state:'pre',statusName:'STATUS_SCHEDULED',date:new Date(kickoff).toISOString()};
let checks=0;function check(value,label){assert.ok(value,label);checks++}
for(const delta of [-14*60000,0,5*60000,KICKOFF_ACTIVE_WINDOW])check(matchTtl(fixture,kickoff+delta)===60000,'one-minute API TTL in active kickoff window');
for(const delta of [KICKOFF_ACTIVE_WINDOW+1,24*3600000,365*86400000]){
 const now=kickoff+delta,status=panelStatus(fixture,now);
 check(matchTtl(fixture,now)===30*60000,'old scheduled API TTL is thirty minutes');
 check(status.kind==='unknown'&&!status.polls&&!status.showScore,'old scheduled never declared live or finished');
 check(nextDelay({anyLive:status.polls,anySoon:false,failures:0,now})===POLL.idle,'historical client refresh is idle');
}
check(matchTtl(fixture,kickoff-15*60000)===5*60000,'15-minute early boundary gets five-minute cache');
check(matchTtl(fixture,kickoff-4*3600000)>=15*60000,'hours away does not aggressively poll missing referee');
check(matchTtl({...fixture,date:'invalid'},kickoff)>=15*60000,'unknown kickoff is not an aggressive loop');
check(matchTtl({...fixture,state:'in'},kickoff+8*3600000)===30000,'explicit live provider signal preserved');
check(matchTtl({...fixture,state:'post'},kickoff+8*3600000)===10*60000,'explicit finished provider signal preserved');
check(panelStatus({...fixture,statusName:'STATUS_POSTPONED'},kickoff+100).kind==='postponed','explicit postponement preserved');
console.log(`PASS ${checks} bounded kickoff polling checks; all clocks injected`);
const {detailPollDelay}=require('../lib/match-status.ts');
check(detailPollDelay(fixture,kickoff+KICKOFF_ACTIVE_WINDOW+1)===POLL.idle,'open historical detail uses idle cadence, not an endless minute fetch');
check(detailPollDelay({...fixture,state:'post',statusName:'STATUS_FINAL'},kickoff+100000)===POLL.idle,'finished detail uses idle cadence');
check(detailPollDelay(fixture,kickoff+100000)===POLL.soon,'kickoff detail retains minute refresh');
console.log(`PASS ${checks} bounded polling assertions including open detail refresh.`);
