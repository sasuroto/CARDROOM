const fs=require('node:fs'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const load=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env:{}}:load.call(this,id,...args)};
const {mergeRefereeUpdates,refereeUpdateKey}=require('../lib/referee-updates.ts');
const {normalizeRefereeSeason}=require('../lib/referee-season.ts');
const stamp='2026-11-01T14:00:00Z',source='https://source.example/referees',rows=[{name:'John Smith',n:12,yellow:4,yellowN:12}];
const legacy={rows,checkedAt:stamp,source,periodLabel:'2026/27',seasonConfirmed:true};
const verified={...legacy,seasonEvidence:{version:1,method:'table-header',season:'2026/27',source,checkedAt:stamp,markers:['GAMES 2026/27']}};
const data=()=>({leagues:[{id:'epl'}],refereesByLeague:{epl:structuredClone(legacy)}});
const bucket=value=>({get:async key=>key===refereeUpdateKey('epl')&&value?{json:async()=>structuredClone(value)}:null});
(async()=>{
 const noUpdate=await mergeRefereeUpdates(data(),bucket(null));assert.equal(noUpdate.refereesByLeague.epl.seasonConfirmed,false);assert.deepEqual(noUpdate.refereesByLeague.epl.rows,rows);assert.equal(noUpdate.refereesByLeague.epl.checkedAt,stamp);
 const same=await mergeRefereeUpdates(data(),bucket({stats:legacy,matches:[],startedAt:stamp}));assert.equal(same.refereesByLeague.epl.seasonConfirmed,false);assert.equal(same.refereeUpdates.epl.persisted,true);
 const good=await mergeRefereeUpdates(data(),bucket({stats:verified,matches:[],startedAt:stamp}));assert.equal(good.refereesByLeague.epl.seasonConfirmed,true);assert.equal(good.refereesByLeague.epl.periodLabel,'Сезон 2026/27');
 for(const change of [{source:'https://other.example'},{checkedAt:'2026-11-02T00:00:00Z'},{seasonEvidence:undefined},{seasonEvidence:{...verified.seasonEvidence,markers:['GAMES 2025/26']}}])assert.equal(normalizeRefereeSeason({...verified,...change}).seasonConfirmed,false);
 assert.ok(fs.readFileSync('app/page.tsx','utf8').includes('refereePeriod(refData)'));
 console.log('PASS season cache guards: legacy/no update, equal timestamp, source/date binding, valid provenance and UI fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
