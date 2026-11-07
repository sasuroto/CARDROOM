// Read-only offline audit. Input on stdin: {revisions:[{key,availableAt,observation}], now?}.
// Never writes forecasts, imports provider data into production, or claims complete coverage.
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {backtest11,historyAsOf}=require('../lib/exact-score-history.ts');
let input;try{input=JSON.parse(fs.readFileSync(0,'utf8'))}catch{throw Error('Incomplete audit JSON; no results calculated')}
const now=input.now||Date.now();
if(!Array.isArray(input.revisions))throw Error('Expected revisions array');
const leagues=[...new Set(input.revisions.map(r=>r.observation.league))].sort();
console.log(JSON.stringify({auditedAt:new Date(now).toISOString(),revisions:input.revisions.length,coverage:'observed-only',leagues:leagues.map(league=>{const h=historyAsOf(input.revisions,league,now),v=backtest11(input.revisions,league,now);return {league,n:h.games.length,from:h.from,to:h.to,latestAvailableAt:h.lastAvailableAt,excluded:h.skips,candidates:v.candidates,evaluated:v.evaluated,skipped:v.skipped,reasons:v.skips,metrics:Object.fromEntries(Object.entries(v.metrics).map(([k,{bins,...m}])=>[k,m]))};})},null,2));
