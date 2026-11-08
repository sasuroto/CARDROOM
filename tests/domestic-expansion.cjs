const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const original=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env:{}}:original.call(this,id,...args)};
const seed=require('../lib/seed.json'),refs=require('../lib/referees.json'),{LEAGUES}=require('../lib/fixtures.ts'),{mergeDataSnapshot}=require('../lib/data-snapshot.ts'),{refreshTasks}=require('../lib/data-refresh.ts'),{parseLeagueTable}=require('../lib/league-table.ts'),{refreshLeagueReferees}=require('../lib/referee-hourly.ts'),{BACKUP_RECORD_KEYS}=require('../lib/runtime-backup.ts');
const added=[['serieb','ita.2','3931',20],['championship','eng.2','3914',24],['ligue2','fra.2','3926',18],['eredivisie','ned.1','725',18],['bundesliga2','ger.2','3927',18]];
(async()=>{
 const old=structuredClone(seed);old.leagues=old.leagues.filter(l=>!added.some(([id])=>l.id===id));old.lastAttempt='2026-11-06T07:00:00Z';
 const merged=mergeDataSnapshot(seed,old);assert.equal(merged.leagues.length,16);assert.equal(merged.lastAttempt,old.lastAttempt);
 assert.equal(merged.leagues.filter(l=>l.id==='bundesliga').length,1);assert.equal(BACKUP_RECORD_KEYS.length,12);
 const tasks=refreshTasks(structuredClone(merged),refs);assert.ok(tasks.every(t=>typeof t.url==='string'&&t.url));
 for(const [id,slug,uid,size] of added){
  const l=merged.leagues.find(l=>l.id===id);assert.equal(LEAGUES[id],slug);assert.equal(l.expectedTeamCount,size);assert.equal(l.cards.avg,null);assert.equal(l.overview.checkedAt,null);assert.equal(refs[id].source,null);assert.ok(!tasks.some(t=>t.id.startsWith(id+':')));
  const doc={uid:'s:600~l:'+uid,children:[{standings:{season:2026,entries:[{team:{id:'1',displayName:'Fixture club'},stats:[]}]}}]};assert.equal(parseLeagueTable(doc,id,2026).league,id);assert.throws(()=>parseLeagueTable({...doc,uid:'s:600~l:700'},id,2026));
  const saved=new Map(),bucket={get:async key=>saved.has(key)?{json:async()=>saved.get(key)}:null,put:async(key,value)=>{saved.set(key,JSON.parse(value));return{etag:'1'}}};
  global.fetch=async url=>{assert.ok(String(url).includes('/'+slug+'/scoreboard'));return Response.json({events:[]})};
  const report=await refreshLeagueReferees(id,bucket);assert.equal(report.persisted,true);assert.equal(report.statsStatus,'unavailable');assert.equal(report.stats.checkedAt,null);assert.equal(report.sourceHealth.statistics.source,null);assert.ok(report.errors.some(e=>e.includes('не подключён')));
  const oldDate='2026-10-01T00:00:00Z';saved.set('referee-updates/v1/'+id+'.json',{...report,startedAt:oldDate,stats:{...report.stats,checkedAt:oldDate,rows:[{name:'Preserved',n:3,yellow:2}]}});
  const retained=await refreshLeagueReferees(id,bucket);assert.equal(retained.stats.checkedAt,oldDate);assert.equal(retained.stats.rows[0].name,'Preserved');
 }
 console.log('PASS five-league expansion: IDs, 16 unique leagues, null sources, persisted reports, legacy backup contract, cache migration and season guards.');
})().catch(e=>{console.error(e);process.exitCode=1});
