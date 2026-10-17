
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const original=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env:{}}:original.call(this,id,...args)};
const seed=require('../lib/seed.json'),refs=require('../lib/referees.json'),{mergeDataSnapshot}=require('../lib/data-snapshot.ts'),{LEAGUES}=require('../lib/fixtures.ts'),{DRAW_LEAGUES}=require('../lib/draw-scenarios.ts'),Matches=require('../app/api/matches/route.ts');
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++};
(async()=>{
 const previous=structuredClone(seed);previous.leagues=previous.leagues.filter(l=>!['superlig','primeira'].includes(l.id));delete previous.refereesByLeague.superlig;delete previous.refereesByLeague.primeira;
 const merged=mergeDataSnapshot(seed,previous);
 check(merged.leagues.length===9,'existing persisted seven-league cache must retain new leagues');
 for(const [id,provider] of [['superlig','tur.1'],['primeira','por.1']]){
  const league=merged.leagues.find(l=>l.id===id);
  check(league&&league.season==='2026/27','season scoped metadata present');
  check(LEAGUES[id]===provider&&DRAW_LEAGUES[id],'calendar, detail and scenarios support both new leagues');
  check(league.cards.n>0&&league.cards.checkedAt&&league.overview.checkedAt,'sourced summaries are dated');
  check(Array.isArray(league.teams)&&Array.isArray(league.corners)&&Array.isArray(refs[id].rows),'all panels have safe arrays');
  let urls=[];global.fetch=async url=>{urls.push(url);return Response.json({events:[{id:'401999999',date:'2026-10-19T18:00Z',status:{type:{state:'pre'}},competitions:[{competitors:[{homeAway:'home',team:{displayName:'Home'}},{homeAway:'away',team:{displayName:'Away'}}]}]}]})};
  let response=await Matches.GET(new Request('https://local/api/matches?date=2026-10-19&league='+id)),body=await response.json();
  check(response.status===200&&body.events.length===1&&body.events[0].league===id,'new league route returns deduplicated fixture');
  check(urls.length===2&&urls.every(url=>url.includes('/'+provider+'/scoreboard')),'both timezone dates target correct provider competition');
  global.fetch=async()=>Response.json({events:[]});body=await(await Matches.GET(new Request('https://local/api/matches?date=2026-10-19&league='+id))).json();
  check(body.events.length===0&&body.errors.length===0,'confirmed empty day does not resurrect fallback');
 }
 console.log('PASS '+checks+' league expansion assertions: provider routing, current season, dated coverage, previous cache migration and empty calendars.');
})().catch(error=>{console.error(error);process.exitCode=1});
