const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {sourceMonitor:S,appointmentCoverage:C}=require('../lib/referee-monitor.ts');
const now=Date.parse('2026-11-01T10:00Z');
assert.equal(S(null,null,now).state,'not-checked');assert.equal(S(null,null,now).persisted,false);
assert.equal(S({statsStatus:'updated'},null,now).state,'updated');
assert.equal(S({statsStatus:'snapshot'},null,now).state,'snapshot');
assert.equal(S({errors:['Статистика: HTTP 403']},null,now).state,'forbidden');
assert.equal(S({errors:['Статистика: HTTP 429']},null,now).state,'rate-limited');
assert.equal(S({errors:['Статистика: повтор после 2026-11-01T12:00:00.000Z']},null,now).state,'cooldown');
assert.equal(S({sourceHealth:{statistics:{retryAt:'2026-11-01T09:00Z'}},statsStatus:'updated'},null,now).state,'updated');
assert.equal(S({nextCheckAt:'2026-11-01T09:00Z',persisted:true},null,now).overdue,true);
assert.equal(S({statsStatus:'updated'},{checkedAt:'2026-10-15'},now).lastSuccess,'2026-10-15');
const c=C([{referee:'One',appointmentType:'official appointment'},{referee:'Two',appointmentType:'ESPN'},{referee:'Three',appointmentStale:true},{referee:null}]);
assert.deepEqual(c,{official:1,fallback:1,stale:1,missing:1,completed:0});
console.log('PASS 11 source monitoring tests');

assert.equal(S({statsStatus:'updated',sourceHealth:{statistics:{httpStatus:403}}},null,now).state,'updated');
