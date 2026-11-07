const fs=require('node:fs'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const values=new Map(),env={BUCKET:{get:async key=>values.has(key)?{json:async()=>structuredClone(values.get(key))}:null,put:async(key,value)=>values.set(key,JSON.parse(value))}};
const original=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env}:original.call(this,id,...args)};
const seed=require('../lib/seed.json'),refs=require('../lib/referees.json'),{LEAGUES}=require('../lib/fixtures.ts'),{mergeDataSnapshot}=require('../lib/data-snapshot.ts'),{parseLeagueTable}=require('../lib/league-table.ts'),{refreshTasks}=require('../lib/data-refresh.ts'),{refreshLeagueReferees}=require('../lib/referee-hourly.ts'),Referees=require('../app/api/referees/route.ts'),Calendar=require('../app/api/matches/route.ts');
const {importWatchList}=require('../app/favorites.tsx');let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++};
(async()=>{
 const previous=structuredClone(seed);previous.leagues=previous.leagues.filter(l=>!['uel','uecl'].includes(l.id));delete previous.refereesByLeague.uel;delete previous.refereesByLeague.uecl;
 previous.leagues[0].overview.goals=3.141;previous.leagues[0].overview.checkedAt='2026-11-05T00:00:00Z';previous.lastAttempt='2026-11-05T00:00:00Z';previous.blockStatus={'epl:overview':{nextAt:'2026-11-05T06:00:00Z'}};
 const merged=mergeDataSnapshot(seed,previous);check(merged.leagues.length===16,'old nine-league cache admits both new tournaments');check(merged.leagues[0].overview.goals===3.141&&merged.lastAttempt===previous.lastAttempt&&merged.blockStatus['epl:overview'].nextAt===previous.blockStatus['epl:overview'].nextAt,'existing data, dates and cooldown preserved');
 const fresh=structuredClone(merged);fresh.leagues.find(l=>l.id==='uel').overview={goals:2.9,checkedAt:'2026-11-05T13:00:00Z'};
 const concurrent=mergeDataSnapshot(mergeDataSnapshot(seed,previous),fresh);check(concurrent.leagues.length===16&&concurrent.leagues.find(l=>l.id==='uel').overview.goals===2.9,'final save against old persisted cache retains new competition blocks');
 check(fs.readFileSync(require.resolve('../app/api/data/route.ts'),'utf8').includes('mergeDataSnapshot(load(latest),data)'),'refresh route normalizes the latest cache before final merge');
 for(const [id,slug,uid] of [['uel','uefa.europa','776'],['uecl','uefa.europa.conf','20296']]){
  const league=merged.leagues.find(l=>l.id===id);check(LEAGUES[id]===slug&&league.code==='EU'&&league.expectedTeamCount===36,'distinct provider and competition metadata');
  check(league.cards.n===null&&league.cards.avg===null&&league.overview.goals===null&&league.overview.checkedAt===null&&refs[id].rows.length===0&&refs[id].checkedAt===null,'new tournament does not fabricate statistics, dates or zeroes');
  const tasks=refreshTasks(merged,refs).filter(t=>t.id.startsWith(id+':'));check(tasks.length===3&&tasks.every(t=>t.url.startsWith('https://footystats.org/europe/')||t.url===refs[id].source),'summary and referee sources wired into existing scheduled refresh');
  const table={uid:'s:600~l:'+uid,children:[{name:'League Phase',standings:{season:2026,entries:[]}}]};check(parseLeagueTable(table,id,2026).groups.length===1,'correct tournament standing UID accepted');assert.throws(()=>parseLeagueTable({...table,uid:'s:600~l:775'},id,2026));checks++;
  check(importWatchList([],JSON.stringify([{kind:'match',id:id+':401999999',league:id,label:'Match'}])).length===1,'new competition watchlist import supported');
  let requests=[];global.fetch=async url=>{requests.push(String(url));return Response.json({events:[]})};
  const calendar=await(await Calendar.GET(new Request('https://local/api/matches?date=2026-11-05&league='+id))).json();check(calendar.events.length===0&&calendar.errors.length===0&&requests.length===2&&requests.every(url=>url.includes('/'+slug+'/scoreboard')),'calendar uses both local-day boundaries and correct competition');
  // An existing host-wide 403 is respected: no new URL on that host bypasses it.
  values.set('referee-updates/source-backoff/valuestats.com.json',{status:403,until:Date.now()+3600000});requests=[];
  const first=await refreshLeagueReferees(id,env.BUCKET),saved=(await(await Referees.GET(new Request('https://local/api/referees?league='+id+'&read=1'))).json()).updates[0];
  check(first.persisted&&saved.persisted&&first.runId===saved.runId,'new league run independently persists and verifies');check(first.statsStatus==='unavailable'&&first.stats.rows.length===0&&first.stats.checkedAt===null&&!requests.some(url=>url.includes('valuestats')),'blocked statistics stay explicitly unavailable without sending forbidden retry');
 }
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tbilisi'}),key=`fixtures/v9/${today}/all/day.json`;
 values.set(key,{events:[],errors:[],checkedAt:new Date().toISOString(),competitionIds:previous.leagues.map(l=>l.id)});let calls=[];global.fetch=async url=>{calls.push(String(url));return Response.json({events:[]})};
 const all=await(await Calendar.GET(new Request('https://local/api/matches?date='+today+'&league=all'))).json();check(all.competitionIds.length===16&&calls.some(url=>url.includes('/uefa.europa/'))&&calls.some(url=>url.includes('/uefa.europa.conf/')),'fresh old all-league cache cannot hide added competitions');
 console.log('PASS '+checks+' European expansion checks: migration, independent sources, missing values, tables, favourites, calendar coverage and verified hourly updates.');
})().catch(e=>{console.error(e);process.exitCode=1});
