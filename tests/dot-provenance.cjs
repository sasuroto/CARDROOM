const fs=require('node:fs'),assert=require('node:assert/strict'),Module=require('node:module'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const original=Module._load,oldDate=new Date(Date.now()-3600000).toISOString(),writes=[],calls=[];
const matchDate=new Date(Date.now()+86400000).toISOString();
const doc=id=>({header:{id,league:{slug:'uefa.champions'},season:{year:2026},competitions:[{status:{type:{state:'post'}}}]}});
Module._load=function(id,...args){
 if(id==='cloudflare:workers')return {env:{BUCKET:{}}};
 if(id==='../../../lib/analysis-fallback')return {savedAnalysis:()=>null};
 if(id==='../../../lib/cache')return {readCache:async(_,key)=>key==='history/v1/ucl/123456.json'?{data:doc('123456'),checkedAt:oldDate}:null,writeCache:async(_,key,value)=>writes.push({key,value})};
 if(id==='../../../lib/fixtures')return {LEAGUES:{ucl:'uefa.champions'},espn:async url=>{calls.push(url);if(url.includes('/schedule?'))return {team:{id:'home'},events:[]};return doc(url.includes('event=123457')?'123457':'999999')}};
 if(id==='../../../lib/match-analysis')return {HISTORY_LIMIT:60,compactMatch:()=>({date:matchDate,teams:[{id:'home'},{id:'away'}]}),historyCandidates:()=>[{id:'home',events:[{id:'123456'},{id:'123457'}]}],buildHistory:(_,docs)=>[{id:'home',events:Object.keys(docs).map(id=>({id,source:`https://www.espn.com/soccer/match/_/gameId/${id}`}))}],playerCandidates:()=>[],compactLineups:()=>[]};
 return original.call(this,id,...args);
};
(async()=>{
 try{
  const route=require('../app/api/analysis/route.ts'),started=Date.now();
  const response=await route.GET(new Request('https://local/api/analysis?id=999999&league=ucl')),data=await response.json();
  assert.deepEqual(data.errors,[]);assert.equal(data.history[0].events.length,2);
  assert.equal(data.history[0].events.find(e=>e.id==='123456').checkedAt,oldDate,'cached history must retain its actual fetch date');
  const fresh=data.history[0].events.find(e=>e.id==='123457').checkedAt;
  assert.ok(Date.parse(fresh)>=started);assert.ok(Date.parse(data.checkedAt)>Date.parse(oldDate));
  assert.equal(calls.filter(u=>u.includes('event=123456')).length,0,'no refetch of valid history cache');
  assert.equal(writes.find(w=>w.key==='history/v1/ucl/123457.json').value.checkedAt,fresh);
  assert.equal(writes.find(w=>w.key==='analysis/v11/ucl/999999.json').value.history[0].events[0].checkedAt,oldDate);
  console.log('PASS DOT API provenance: cached/new history dates preserved separately from summary time');
 }finally{Module._load=original}
})().catch(e=>{console.error(e);process.exitCode=1});
