/* Real workerd regression: Node-only mocks do not enforce per-request I/O ownership.
 * All upstream traffic is redirected to this test's local HTTP fixture. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createRequire}=require('node:module');
const ts=require('typescript');
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const root=path.resolve(__dirname,'..');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function source(){return ['cache','provider-backoff','espn-fetch','calendar-requests'].map(name=>ts.transpileModule(fs.readFileSync(path.join(root,'lib',name+'.ts'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).join('\n')}
async function run(){
 let active=0,max=0,calls=0;let checks=0;
 const origin=http.createServer((req,res)=>{calls++;active++;max=Math.max(max,active);setTimeout(()=>{active--;res.setHeader('content-type','application/json');if(req.url.includes('mode=limited')){res.statusCode=429;res.setHeader('Retry-After','3600')}res.end(JSON.stringify({ok:true,path:req.url}))},120)});
 await new Promise(resolve=>origin.listen(0,'127.0.0.1',resolve));const port=origin.address().port;
 const script=`const nativeFetch=globalThis.fetch;globalThis.fetch=(url,options)=>nativeFetch(String(url).replace('https://site.api.espn.com','http://127.0.0.1:${port}'),options);\n${source()}\nexport default {async fetch(req){const u=new URL(req.url);if(u.pathname.startsWith('/calendar')){const results=await runCalendarRequests(Array.from({length:32},(_,i)=>()=>fetchEspn('https://site.api.espn.com/test?mode='+u.searchParams.get('mode')+'&id='+u.pathname+'&job='+i)));return Response.json(results.map(r=>r.status==='fulfilled'?{status:r.status,value:r.value}:{status:r.status,retryAfter:r.reason.retryAfter}))}try{return Response.json(await fetchEspn('https://site.api.espn.com/test?mode='+u.searchParams.get('mode')+'&id='+u.pathname))}catch(error){return Response.json({error:String(error),retryAfter:error.retryAfter},{status:error.retryAfter?429:502})}}}`;
 const runtimes=[];
 const fresh=async()=>{const mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-15'});runtimes.push(mf);return await mf.ready};
 const get=(url,name,signal=AbortSignal.timeout(8000))=>fetch(new URL(name,url),{signal}).then(async r=>({status:r.status,body:await r.text()}));
 try{
  const url=await fresh();
  const results=await Promise.all(Array.from({length:18},(_,i)=>get(url,'/'+i)));
  assert.equal(results.filter(r=>r.status===200).length,18,JSON.stringify(results));checks++;
  assert.ok(max>1&&max<=4,`Actual upstream concurrency ${max}`);checks++;
  assert.equal(calls,18);checks++;
  assert.ok(results.every((r,i)=>JSON.parse(r.body).path.endsWith('&id=/'+i)),'Each response belongs to its requesting invocation');checks++;
  assert.equal((await get(url,'/after-drain')).status,200,'Later request must not inherit hung global queue');checks++;
  // Cancellation of one HTTP client must not strand permits for other invocations.
  const controller=new AbortController();
  const abandoned=get(url,'/abandoned',controller.signal).catch(error=>({error:error.name}));
  await pause(30);
  const following=Promise.all(Array.from({length:8},(_,i)=>get(url,'/after-abort-'+i)));
  controller.abort();assert.equal((await abandoned).error,'AbortError');checks++;
  assert.ok((await following).every(r=>r.status===200),'Surviving requests recover after client abort');checks++;
  assert.equal((await get(url,'/after-abort-drain')).status,200);checks++;
  // Also abandon a queued invocation while four independent owners hold slots.
  const holders=Promise.all(Array.from({length:4},(_,i)=>get(url,'/holder-'+i)));
  await pause(30);
  const queuedController=new AbortController(),queued=get(url,'/queued-abort',queuedController.signal).catch(error=>({error:error.name}));
  await pause(20);queuedController.abort();assert.equal((await queued).error,'AbortError');checks++;
  assert.ok((await holders).every(r=>r.status===200));checks++;
  assert.equal((await get(url,'/after-queued-abort')).status,200);checks++;
  // Actual request-local calendar scheduler and provider guard, without shared
  // Promises or a synthetic single invocation standing in for separate clients.
  const calendarBefore=calls;
  const calendars=await Promise.all(Array.from({length:3},(_,i)=>get(url,'/calendar-'+i)));
  assert.equal(calls-calendarBefore,96);checks++;
  assert.ok(calendars.every((r,i)=>{const rows=JSON.parse(r.body);return rows.length===32&&rows.every((row,j)=>row.status==='fulfilled'&&row.value.path.endsWith('&id=/calendar-'+i+'&job='+j))}),'Three calendar invocations retain all 96 independent response identities');checks++;
  assert.ok(max<=4,'Rolling calendar jobs do not expand the host concurrency cap');checks++;
  const calendarController=new AbortController();
  const abandonedCalendar=get(url,'/calendar-abandoned',calendarController.signal).catch(error=>({error:error.name}));
  await pause(30);
  const survivingCalendars=Promise.all([get(url,'/calendar-survivor-a'),get(url,'/calendar-survivor-b')]);
  calendarController.abort();assert.equal((await abandonedCalendar).error,'AbortError');checks++;
  assert.ok((await survivingCalendars).every(r=>JSON.parse(r.body).every(row=>row.status==='fulfilled')),"Abandoned calendar client cannot strand another invocation's jobs");checks++;
  assert.equal((await get(url,'/after-calendar-abort')).status,200);checks++;
  const calendarLimitedUrl=await fresh(),beforeCalendarLimit=calls;
  const calendarLimited=await Promise.all([get(calendarLimitedUrl,'/calendar-limit-a?mode=limited'),get(calendarLimitedUrl,'/calendar-limit-b?mode=limited')]);
  assert.ok(calendarLimited.every(r=>JSON.parse(r.body).every(row=>row.status==='rejected'&&row.retryAfter>Date.now())),'All undispatched source work retains known cooldown errors');checks++;
  assert.ok(calls-beforeCalendarLimit<=4,'429 from concurrent calendars allows no traffic beyond first four');checks++;
  const afterCalendarLimit=calls;
  assert.ok(JSON.parse((await get(calendarLimitedUrl,'/calendar-later')).body).every(row=>row.status==='rejected'));checks++;
  assert.equal(calls,afterCalendarLimit,'Subsequent calendar invocation cannot bypass host cooldown');checks++;
  const limitedUrl=await fresh(),before=calls;
  const limited=await Promise.all(Array.from({length:18},(_,i)=>get(limitedUrl,'/'+i+'?mode=limited')));
  assert.ok(limited.every(r=>r.status===429),JSON.stringify(limited));checks++;
  assert.ok(calls-before<=4,`429 must stop new upstream attempts: ${calls-before}`);checks++;
  const after=calls;assert.equal((await get(limitedUrl,'/still-limited')).status,429);checks++;
  assert.equal(calls,after,'Later invocation must respect shared numeric cooldown');checks++;
  console.log(`PASS ${checks} real workerd request-isolation checks (18 independent HTTP invocations; max upstream ${max}; no external network).`);
 }finally{await Promise.all(runtimes.map(m=>m.dispose()));origin.closeAllConnections();await new Promise(resolve=>origin.close(resolve))}
}
run().catch(error=>{console.error(error);process.exitCode=1});
