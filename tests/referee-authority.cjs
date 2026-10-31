const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const A=require('../lib/referee-authority.ts'),{withAppointment}=require('../lib/fixture-display.ts'),{fixture}=require('../lib/fixtures.ts');
let n=0;const check=(v,s)=>{assert.ok(v,s);n++};
const official={id:'1',league:'bundesliga',date:'2026-10-31T17:30Z',referee:'Felix Zwayer',assistants:['A One','B Two'],var:'C Three',appointmentType:'DFB · официальное назначение',appointmentSource:'https://datencenter.dfb.de/x',appointmentCheckedAt:'2026-10-30T10:00:00Z',currentVerified:true};
const espn={id:'1',league:'bundesliga',referee:'Daniel Siebert',appointmentType:'ESPN · данные матча',appointmentSource:'https://www.espn.com/soccer/match/_/gameId/1',appointmentCheckedAt:'2026-10-31T12:00:00Z',currentVerified:true};

check(A.appointmentTier(official)===2&&A.appointmentTier(espn)===1&&A.appointmentTier({referee:'X'})===0,'tiers: official > ESPN > saved');
check(A.appointmentTier({appointmentType:'Premier League · официальное назначение'})===2,'PL label is official');

let out=withAppointment(official,espn);
check(out.referee==='Felix Zwayer'&&out.appointmentCheckedAt===official.appointmentCheckedAt,'newer ESPN poll cannot replace a verified official appointment');
check(out.appointmentConflict?.referee==='Daniel Siebert','disagreeing ESPN name is kept as a visible conflict, not applied');

out=withAppointment({...official,appointmentStale:true,currentVerified:false},espn);
check(out.referee==='Felix Zwayer'&&out.appointmentStale&&out.appointmentCheckedAt===official.appointmentCheckedAt,'stale official appointment is preserved with its original timestamp');
check(A.appointmentState(out)==='stale','stale official is labelled stale, not confirmed');

out=withAppointment({id:'1',league:'bundesliga',referee:null},espn);
check(out.referee==='Daniel Siebert'&&A.appointmentState(out)==='unconfirmed','ESPN fills a missing name and is labelled unconfirmed');

out=withAppointment({...espn,assistants:['Old Assistant'],fourthOfficial:'Old Fourth'},{...official,appointmentCheckedAt:'2026-10-29T08:00:00Z'});
check(out.referee==='Felix Zwayer'&&out.fourthOfficial===null&&out.assistants.join()==='A One,B Two','official replaces ESPN regardless of poll order and never mixes crews');
check(A.appointmentState(out)==='confirmed','fresh official appointment is confirmed');

out=withAppointment(official,{id:'1',league:'bundesliga',referee:null,lastAttemptAt:'2026-10-31T13:00:00Z',appointmentType:'ESPN · данные матча'});
check(!out.appointmentStale&&out.currentVerified,'empty ESPN response cannot downgrade an official appointment');
check(withAppointment(official,{...espn,id:'2'}).referee==='Felix Zwayer'&&withAppointment(official,{...official,league:'epl',referee:'X'}).referee==='Felix Zwayer','other fixture or competition is ignored');

check(A.appointmentState({...official,state:'post'})==='completed','finished match is not presented as a current appointment');
check(A.appointmentState({})==='unavailable','missing name is unavailable');
check(A.sameName('M. Oliver','Michael Oliver')&&!A.sameName('Michael Oliver','Craig Pawson'),'name comparison handles initials');

const now=Date.parse('2026-10-31T10:00:00Z');
check(A.matchTtl({state:'in'},now)===30000,'live match refreshes every 30 s');
check(A.matchTtl({...official,state:'pre',date:'2026-11-03T18:00Z'},now)===3600000,'confirmed official far from kickoff: hourly');
check(A.matchTtl({...official,state:'pre',date:'2026-10-31T12:00Z'},now)===300000,'last 3 hours before kickoff: every 5 minutes');
check(A.matchTtl({state:'pre',date:'2026-11-10T12:00Z'},now)===1800000,'no name, far fixture: avoids repeated ESPN requests');

// Calendar: a saved official notice (even past its freshness window) outranks ESPN's listing.
const raw={id:'401883158',date:'2026-10-16T18:30Z',status:{type:{state:'pre',name:'STATUS_SCHEDULED'},displayClock:"0'"},competitions:[{competitors:[{homeAway:'home',team:{displayName:'Leganés'},score:'0'},{homeAway:'away',team:{displayName:'Córdoba'},score:'0'}],officials:[{displayName:'Someone Else',position:{displayName:'Referee'}}]}],links:[]};
const f=fixture(raw,'segunda');
check(f.referee==='Eder Mallo'&&f.appointmentConflict?.referee==='Someone Else','calendar keeps RFEF appointment over ESPN and records the disagreement');
check(f.statusName==='STATUS_SCHEDULED'&&f.clock==="0'",'calendar exposes status and clock for live tracking');

console.log(`PASS ${n} referee-authority assertions: source tiers, stale official preservation, conflicts, crew integrity, states and refresh policy.`);
