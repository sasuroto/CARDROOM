// Synthetic fixtures only: no external provider requests or production storage.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {fetchEspn,EspnSourceError,sourceDiagnostic}=require('../lib/espn-fetch.ts');
const {cachedLeagueData}=require('../lib/league-data-cache.ts');
const {parseLeagueTable,loadLeagueTable,emptyLeagueTable}=require('../lib/league-table.ts');
const {LEAGUES}=require('../lib/fixtures.ts');
let checks=0;function check(value,label){assert.ok(value,label);checks++}
const rows=new Map(),writes=[];
const bucket={get:async key=>rows.has(key)?{json:async()=>structuredClone(rows.get(key))}:null,put:async(key,value)=>{writes.push(key);rows.set(key,JSON.parse(value))}};
const old={checkedAt:'2025-01-01T00:00:00.000Z',groups:[{name:'Confirmed',entries:[{id:'1',points:7}]}],teams:[{id:'1',name:'Confirmed'}]};
const secret='SECRET https://private.invalid?token=hidden Authorization: bearer hidden';
const url='https://site.web.api.espn.com/fixture';
async function fallback(label,load,reason,status=null){
 const key='synthetic/'+label;rows.set(key,structuredClone(old));const before=writes.length;
 const result=await cachedLeagueData(bucket,key,1,load,()=>({checkedAt:null}));
 assert.deepEqual(result.groups,old.groups);assert.deepEqual(result.teams,old.teams);checks+=2;
 check(result.checkedAt===old.checkedAt&&result.stale,'failed attempt preserves success date');
 check(result.diagnostic.reason===reason&&result.diagnostic.httpStatus===status,label+' typed reason');
 check(!JSON.stringify(result).includes(secret)&&!JSON.stringify(result.diagnostic).includes('hidden'),'no raw exception data');
 check(writes.length===before,'failed snapshot is never written');
 return result;
}
(async()=>{
 await fallback('unknown',async()=>{throw Object.assign(Error(secret),{reason:'http',httpStatus:403,retryAfter:Date.now()+99999})},'unknown');
 global.fetch=async()=>{throw TypeError(secret)};
 await fallback('network',()=>fetchEspn(url),'network');
 global.fetch=async()=>new Response(secret,{status:502});
 await fallback('http',()=>fetchEspn(url),'http',502);
 global.fetch=async()=>new Response('{'+secret,{status:200});
 await fallback('json',()=>fetchEspn(url),'invalid_schema');
 const nativeTimeout=AbortSignal.timeout;
 try{AbortSignal.timeout=()=>AbortSignal.abort();global.fetch=async()=>{throw Error(secret)};await fallback('timeout',()=>fetchEspn(url),'timeout')}finally{AbortSignal.timeout=nativeTimeout}
 const valid={uid:'s:600~l:700',children:[{standings:{season:2026,entries:[]}}]};
 await fallback('wrong-league',async()=>parseLeagueTable({...valid,uid:'s:600~l:775'},'epl',2026),'wrong_league');
 await fallback('wrong-season',async()=>parseLeagueTable(valid,'epl',2025),'wrong_season');
 for(const [i,doc] of [null,{...valid,uid:''},{...valid,children:[null]},{...valid,children:[{standings:{season:2026,entries:[null]}}]},{...valid,children:[{standings:{season:'invalid',entries:[]}}]}].entries())await fallback('schema-'+i,async()=>parseLeagueTable(doc,'epl',2026),'invalid_schema');
 const queued=await fallback('queue',async()=>{throw new EspnSourceError('queue',secret,null,Date.now()+60000)},'queue');
 check(Number.isFinite(Date.parse(queued.diagnostic.retryAt)),'queue retry is ISO');
 for(const retry of [Infinity,NaN,-1,253402300800000,'2026-11-07','hidden'])check(sourceDiagnostic(new EspnSourceError('backoff',secret,429,retry)).retryAt===null,'unsafe retry value is omitted');
 check(sourceDiagnostic(new EspnSourceError('http',secret,200)).httpStatus===null,'invalid HTTP failure code omitted');
 const absent=await cachedLeagueData(bucket,'absent',1,async()=>{throw Error(secret)},()=>({checkedAt:null,groups:[]}));
 check(absent.checkedAt===null&&!absent.stale&&absent.diagnostic.reason==='unknown','no invented success when no cache');
 // A single standings-host rejection is a plausible shared cause of all-league failures.
 let upstream=0,calendar=0;global.fetch=async raw=>{if(new URL(raw).hostname==='site.api.espn.com'){calendar++;return Response.json({events:[]})}upstream++;return new Response('',{status:403,headers:{'Retry-After':'3600'}})};
 for(const league of Object.keys(LEAGUES))rows.set(`league-table/v1/${league}/2026.json`,{...emptyLeagueTable(league,2026),...structuredClone(old)});
 const results=[];for(const league of Object.keys(LEAGUES))results.push(await loadLeagueTable(bucket,league,2026));
 check(results.length===16&&results.every(r=>r.diagnostic.reason==='backoff'&&r.diagnostic.httpStatus===403),'all16 expose one shared standings host backoff');
 check(upstream===1,'host cooldown prevents additional provider requests');
 check(results.every(r=>r.checkedAt===old.checkedAt&&r.groups[0].entries[0].points===7&&r.stale),'all16 preserve confirmed rows and success times');
 check(results.every(r=>/^\d{4}-\d\d-\d\dT/.test(r.diagnostic.retryAt)),'all16 expose safe retryAt');
 check(writes.every(key=>key.startsWith('referee-updates/source-backoff/')),'only existing cooldown writes, never failure snapshots');
 await fetchEspn('https://site.api.espn.com/fixture',bucket);check(calendar===1,'calendar origin remains eligible');
 // Cold adapter instance reads the saved 403.
 delete require.cache[require.resolve('../lib/espn-fetch.ts')];const cold=require('../lib/espn-fetch.ts');
 try{await cold.fetchEspn(url,bucket);assert.fail('must respect cooldown')}catch(error){check(cold.sourceDiagnostic(error).reason==='backoff'&&upstream===1,'cold instance respects persisted cooldown')}
 global.fetch=async()=>new Response('',{status:429,headers:{'Retry-After':'3600'}});
 try{await cold.fetchEspn('https://site.api.espn.com/fixture');assert.fail('must reject 429')}catch(error){const diagnostic=cold.sourceDiagnostic(error);check(diagnostic.reason==='backoff'&&diagnostic.httpStatus===429&&Number.isFinite(Date.parse(diagnostic.retryAt)),'429 exposes redacted cooldown metadata')}
 console.log(`PASS ${checks} standings diagnostics checks; synthetic single 403 -> all16 stale tables, calendar eligible; no external traffic.`);
})().catch(error=>{console.error(error);process.exitCode=1});
