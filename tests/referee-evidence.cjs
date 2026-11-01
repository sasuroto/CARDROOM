const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {refereeEvidence:E,yellowSample,refereePeriod}=require('../lib/referee-evidence.ts');
const now=Date.parse('2026-11-01T08:00Z'),m={referee:'John Smith',date:'2026-11-02T18:00Z',appointmentType:'official appointment',appointmentCheckedAt:'2026-11-01T07:00Z'},g={source:'https://source.example/referees',seasonConfirmed:true,periodLabel:'2026/27',seasonEvidence:{version:1,method:'table-header',season:'2026/27',source:'https://source.example/referees',checkedAt:'2026-11-01T07:00Z',markers:['GAMES 2026/27']},checkedAt:'2026-11-01T07:00Z',rows:[{name:'John Smith',n:20,yellowN:12,yellow:4},{name:'Other Ref',n:10,yellowN:4,yellow:6}]};
assert.equal(E(m,g,now).eligible,true);assert.equal(E(m,g,now).n,12);assert.equal(E(m,g,now).baseline,4.5);assert.equal(E(m,g,now).baselineN,16);
assert.equal(yellowSample({n:20}),0);assert.equal(yellowSample({yellowN:0}),0);
for(const change of [{seasonConfirmed:false},{seasonConfirmed:undefined},{checkedAt:'bad'},{checkedAt:'2026-10-01'},{checkedAt:'2026-12-01'},{rows:[{name:'John Smith',n:20,yellowN:2,yellow:5}]}])assert.equal(E(m,{...g,...change},now).eligible,false);
for(const change of [{appointmentStale:true},{stale:true},{appointmentType:'ESPN'},{appointmentConflict:{referee:'Other'}},{appointmentCheckedAt:null},{appointmentCheckedAt:'2026-10-01'},{date:'2026-10-30'}])assert.equal(E({...m,...change},g,now).eligible,false);
assert.equal(E({...m,referee:null},g,now).eligible,false);assert.equal(E(m,null,now).baseline,null);
assert.ok(fs.readFileSync('app/match-report.tsx','utf8').includes('if(e.eligible)'));
console.log('PASS 22 referee evidence assertions: sample, weighting, season, freshness, appointment conflict and model gating');

assert.equal(refereePeriod({periodLabel:'2026/27'}),'Период источника не подтверждён');
assert.equal(refereePeriod({seasonConfirmed:false,periodLabel:'2026/27'}),'Период источника не подтверждён');
assert.equal(refereePeriod({seasonConfirmed:true}),'Период источника не подтверждён');
assert.equal(refereePeriod({seasonConfirmed:true,periodLabel:'2026/27'}),'Период источника не подтверждён');
assert.equal(refereePeriod(g),'2026/27');
for(const change of [{seasonEvidence:undefined},{source:'https://other.example'},{seasonEvidence:{...g.seasonEvidence,checkedAt:'2026-10-01'}},{seasonEvidence:{...g.seasonEvidence,markers:['GAMES 2025/26']}}])assert.equal(E(m,{...g,...change},now).seasonConfirmed,false);
console.log('PASS 4 period provenance assertions');
