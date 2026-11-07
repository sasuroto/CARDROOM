const fs=require('node:fs'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const env={},load=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env}:load.call(this,id,...args)};
const values=new Map();env.BUCKET={get:async key=>values.has(key)?{json:async()=>structuredClone(values.get(key))}:null,put:async(key,value)=>values.set(key,JSON.parse(value))};
const fixture='888900112',logo='https://a.espncdn.com/i/teamlogos/soccer/500/86.png';let incomplete=false,offline=false,kickoff='2026-12-01T20:00Z';
global.fetch=async()=>{if(offline)throw Error('offline');return Response.json({header:{id:fixture,league:{slug:'por.1'},competitions:[{id:fixture,date:kickoff,status:{type:{state:'pre'}},competitors:[{homeAway:'home',team:{id:incomplete?undefined:'1',displayName:'Home',logo}},{homeAway:'away',team:{id:incomplete?undefined:'2',displayName:'Away',logo}}]}]},gameInfo:{officials:[{displayName:'Example Referee',position:'referee'}]},rosters:[1,2].map(id=>({team:{id:String(id)},roster:Array.from({length:11},(_,i)=>({starter:true,athlete:{id:String(id*100+i),displayName:'Player '+i}}))}))})};
const Match=require('../app/api/match/route.ts'),{withAppointment:mergeSelectedMatch}=require('../lib/fixture-display.ts');
const request=()=>Match.GET(new Request('https://site/api/match?id='+fixture+'&league=primeira&evidence=1'));
const expire=()=>{for(const [k,v]of values)if(k.startsWith('match/'))values.set(k,{...v,fetchedAt:'2000-01-01T00:00Z'})};
(async()=>{
 // Fresh v75 cache lacks dossier/status schema: revalidate once instead of displaying an empty new tab until TTL.
 values.set('match/v6/primeira/'+fixture+'.json',{id:fixture,league:'primeira',date:kickoff,state:'pre',home:'Home',away:'Away',fetchedAt:new Date().toISOString()});
 const initial=await(await request()).json();assert.equal(initial.dossier.teams[0].lineup.status,'source-confirmed');assert.equal(initial.dossierError,null);
 incomplete=true;expire();const partial=await(await request()).json();assert.equal(partial.homeLogo,logo);assert.equal(partial.referee,'Example Referee');assert.ok(partial.dossierError);assert.equal(partial.dossier.fetchedAt,initial.dossier.fetchedAt);assert.equal(partial.error,undefined);
 incomplete=false;expire();const restored=await(await request()).json();assert.equal(restored.dossierError,null);assert.equal(restored.dossier.teams[0].lineup.status,'source-confirmed');
 offline=true;expire();const lost=await(await request()).json();assert.equal(lost.stale,true);assert.equal(lost.dossier.fetchedAt,restored.dossier.fetchedAt);
 offline=false;incomplete=true;kickoff='2026-12-02T20:00Z';expire();const moved=await(await request()).json();assert.equal(moved.date,kickoff);assert.equal(moved.dossier,null);assert.ok(moved.dossierError);assert.equal(moved.homeLogo,logo);
 const movedMerged=mergeSelectedMatch(restored,moved);assert.equal(movedMerged.dossier,null);
 const omitted=mergeSelectedMatch(restored,{id:fixture,league:'primeira',date:kickoff,state:'pre',statusCheckedAt:new Date(Date.now()+1000).toISOString(),statusStale:false});assert.equal(omitted.dossier,null);
 const React=require('react'),render=require('react-dom/server').renderToStaticMarkup,Dossier=require('../app/match-evidence.tsx').default;const html=render(React.createElement(Dossier,{match:{...moved,dossier:restored.dossier},view:'lineups'}));assert.ok(!html.includes('Player 0'),'UI must not render lineup of previous kickoff');assert.ok(html.includes('Состав пока не получен'));
 const renderEvidence=(m,view)=>render(React.createElement(Dossier,{match:m,view}));
 const refereeOnly=renderEvidence({...restored,stale:true,error:'Old referee',appointmentStale:true,statusStale:false},'lineups');assert.ok(!refereeOnly.includes('Повторная проверка состава и событий не подтверждена'));
 const offlineUi=renderEvidence({...restored,statusStale:true},'events');assert.ok(offlineUi.includes('сохранённый срез'));
 const sourcesUi=renderEvidence({...restored,statusSource:'javascript:alert(1)'},'sources');assert.ok(!sourcesUi.includes('javascript:'));assert.ok(sourcesUi.includes('Лента не получена; количество неизвестно'));
 const staleDetail={...restored,dossier:{...restored.dossier,fetchedAt:'2000-01-01T00:00Z'}};assert.equal(mergeSelectedMatch(restored,staleDetail).dossier.fetchedAt,restored.dossier.fetchedAt);
 console.log('PASS dossier parser failure preserves match, logo, referee and original dossier timestamp; recovery clears error; offline retains timestamp; older dossier cannot replace newer; rescheduled invalid dossier is discarded by API/merge/UI');
})().catch(e=>{console.error(e);process.exitCode=1});
