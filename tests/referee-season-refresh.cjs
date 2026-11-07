const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {refreshTasks,runRefresh}=require('../lib/data-refresh.ts');
const {refereeEvidence}=require('../lib/referee-evidence.ts');
const config={epl:{source:'https://source.example/referees'}};
const old={source:config.epl.source,checkedAt:'2026-10-01T00:00:00Z',rows:[{name:'John Smith',n:10,yellowN:10,yellow:4}],seasonConfirmed:false,periodLabel:'Unknown'};
const make=()=>({leagues:[],refereesByLeague:{epl:structuredClone(old)}});
const html=(season,n=12)=>`<h1>${season}</h1><table><tr><td>REFEREE</td><td>OTHER</td><th>GAMES ${season}</th><td>YELLOW CARDS</td><td>RED</td></tr><tr><td>John Smith</td><td>-</td><td>${n}</td><td>48</td><td>1</td></tr></table>`;
const now=Date.parse('2026-11-01T14:00:00Z');
(async()=>{
 const fresh=make();await runRefresh(fresh,refreshTasks(fresh,config),async()=>html('2026/27'),now);
 assert.equal(fresh.refereesByLeague.epl.seasonConfirmed,true);assert.equal(fresh.refereesByLeague.epl.periodLabel,'Сезон 2026/27');assert.equal(fresh.refereesByLeague.epl.checkedAt,new Date(now).toISOString());
 for(const response of [html('2025/26'),html('2026/27',5),'<h1>2026/27</h1>']){
  const data=make();await runRefresh(data,refreshTasks(data,config),async()=>response,now);
  assert.equal(data.refereesByLeague.epl.seasonConfirmed,false);assert.equal(data.refereesByLeague.epl.checkedAt,old.checkedAt);assert.equal(data.refereesByLeague.epl.periodLabel,'Период источника не подтверждён');assert.ok(data.refereesByLeague.epl.refreshError);
 }
 const mixed=make();await runRefresh(mixed,refreshTasks(mixed,config),async()=>html('2026/27').replace('<table>','<table><caption>2025/26</caption>'),now);assert.equal(mixed.refereesByLeague.epl.checkedAt,old.checkedAt);assert.equal(mixed.refereesByLeague.epl.seasonConfirmed,false);assert.equal(mixed.refereesByLeague.epl.periodLabel,'Период источника не подтверждён');
 const offline=make();await runRefresh(offline,refreshTasks(offline,config),async()=>{throw Error('offline')},now);assert.equal(offline.refereesByLeague.epl.checkedAt,old.checkedAt);assert.equal(offline.refereesByLeague.epl.seasonConfirmed,false);
 for(const rows of [[],[{name:'John Smith',n:12,yellow:4}]]){const e=refereeEvidence({referee:'John Smith'},{...old,rows},now);assert.equal(e.sampleKnown,false);assert.equal(e.eligible,false);assert.ok(!e.reasons.some(x=>x.includes('0 матчей')));}
 const zero=refereeEvidence({referee:'John Smith'},{...old,rows:[{name:'John Smith',yellowN:0,yellow:0}]},now);assert.equal(zero.sampleKnown,true);assert.ok(zero.reasons.some(x=>x.includes('0 матчей')));
 console.log('PASS referee season refresh: success, old season, shrinking sample, parser failure, outage, missing and real-zero evidence');
})().catch(e=>{console.error(e);process.exitCode=1});
