/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node regression harness uses CommonJS. */
const fs=require('fs'),Module=require('module'),assert=require('node:assert/strict'),ts=require('typescript');
const restores=[];
(async()=>{try{
const extensions=Object.fromEntries(['.ts','.tsx'].map(ext=>[ext,require.extensions[ext]]));
restores.push(()=>{for(const [ext,handler] of Object.entries(extensions)){if(handler)require.extensions[ext]=handler;else delete require.extensions[ext]}});
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {installClock}=require('./helpers/test-clock.cjs');
const clock=installClock(Date.parse('2026-11-02T17:00:00Z')),originalFetch=global.fetch;
restores.push(()=>{clock.restore();global.fetch=originalFetch});
const values=new Map();let revision=0;const etags=new Map();
const env={BUCKET:{get:async key=>values.has(key)?{etag:etags.get(key)||'seed',json:async()=>structuredClone(values.get(key))}:null,put:async(key,value,options)=>{const condition=options?.onlyIf;if(condition instanceof Headers&&condition.get('If-None-Match')==='*'&&values.has(key)||condition?.etagMatches&&condition.etagMatches!==(etags.get(key)||'seed'))return null;values.set(key,JSON.parse(value));const etag=String(++revision);etags.set(key,etag);return {etag}}}};
const original=Module._load;restores.push(()=>{Module._load=original});Module._load=function(id,...args){return id==='cloudflare:workers'?{env}:original.call(this,id,...args)};
const calls=[];
global.fetch=async url=>{calls.push(String(url));return new Response('',{status:429,headers:{'Retry-After':'3600'}})};
const fixtures=require('../lib/fixtures.ts'),Calendar=require('../app/api/matches/route.ts'),originalEspn=fixtures.espn;
restores.push(()=>{fixtures.espn=originalEspn});
const get=(date,league='all')=>clock.run((async()=>(await Calendar.GET(new Request(`https://site/api/matches?date=${date}&league=${league}`))).json())());
let checks=0;const check=(ok,msg)=>{assert.ok(ok,msg);checks++};

 const firstStart=clock.now,first=await get('2026-11-02');
 check(first.retryAfter===firstStart+3600000&&first.errors.length===16,'calendar exposes provider retry deadline for all failed leagues');
 check(calls.length===4,'first 429 stops new attempts after at most four already in-flight calls');
 check(values.get('referee-updates/source-backoff/site.api.espn.com.json')?.until===first.retryAfter,'cooldown is persisted for all routes and isolates');
 const changed=await get('2026-11-03','seriea');
 check(changed.retryAfter===first.retryAfter&&calls.length===4,'changing date and league cannot bypass global source cooldown');
 const cached=await get('2026-11-02');
 check(cached.retryAfter===first.retryAfter&&calls.length===4,'cached calendar keeps retry deadline');
 await assert.rejects(()=>fixtures.espn('https://site.api.espn.com/apis/summary?event=12345',env.BUCKET),error=>error.retryAfter===first.retryAfter);
 check(calls.length===4,'detail/history/analysis caller shares same provider guard');
 await assert.rejects(()=>require('../lib/referee-hourly.ts').hourlySource(env.BUCKET,'https://site.api.espn.com/apis/scoreboard'),error=>error.retryAfter===first.retryAfter);
 check(calls.length===4,'hourly source shares the same provider queue/cooldown');
 // A fresh module simulates another cold isolate; it must read the persisted guard.
 delete require.cache[require.resolve('../lib/espn-fetch.ts')];const cold=require('../lib/espn-fetch.ts').fetchEspn;
 await assert.rejects(()=>cold('https://site.api.espn.com/apis/summary?event=67890',env.BUCKET),error=>error.retryAfter===first.retryAfter);
 check(calls.length===4,'cold isolate respects shared R2 deadline');
 // A longer persisted deadline wins over an older local one.
 values.set('referee-updates/source-backoff/site.api.espn.com.json',{until:clock.now+7200000,status:429});
 const later=await get('2026-11-04','epl');check(later.retryAfter===clock.now+7200000&&calls.length===4,'maximum known deadline wins');
 // Aggregation must not discard a longer per-query rejection, including other failure kinds.
 const savedEspn=fixtures.espn;let nth=0;fixtures.espn=async()=>{throw Object.assign(Error('HTTP 429'),{retryAfter:clock.now+(++nth%2?3600000:10800000)})};
 const aggregate=await get('2026-11-05','epl');check(aggregate.retryAfter===clock.now+10800000,'calendar aggregates maximum rejection retryAfter');fixtures.espn=savedEspn;
 await clock.advance(7200001);global.fetch=async url=>{calls.push(String(url));return Response.json({events:[]})};
 const recovered=await get('2026-11-06','epl');check(recovered.errors.length===0&&!recovered.retryAfter&&calls.length===6,'deadline expiry allows successful polling and clears retry metadata');
 // Scope the concurrency guarantee accurately: host-local bounded parallelism, shared
 // persistent cooldown, but R2 is not a distributed atomic rate limiter.
 let inFlight=0,maxFlight=0,requests=0;global.fetch=async()=>{requests++;inFlight++;maxFlight=Math.max(maxFlight,inFlight);await new Promise(r=>setTimeout(r,2));inFlight--;return Response.json({ok:true})};
 await clock.run(Promise.all(Array.from({length:12},(_,i)=>fixtures.espn(`https://site.api.espn.com/apis/test?q=${i}`,env.BUCKET))));
 check(requests===12&&maxFlight===4,'local-process pool permits at most four in-flight requests per ESPN hostname');
 await assert.rejects(()=>fixtures.espn('https://example.invalid/other',env.BUCKET));
 check(requests===12,'guard rejects unsupported provider origin');
 // Deliberately keep these transports pending even after their abort signal,
 // to exercise admission/queue expiry independently from fetch cancellation.
 const releases=[];let burstFetches=0,burstRejected=0;global.fetch=async()=>{burstFetches++;return new Promise(resolve=>{releases.push(()=>resolve(Response.json({ok:true})))})};
 const burst=Promise.allSettled(Array.from({length:65},(_,i)=>fixtures.espn(`https://site.api.espn.com/apis/burst?q=${i}`,env.BUCKET).catch(error=>{burstRejected++;throw error})));
 await clock.flush();await clock.advance(14999);
 check(burstFetches===4&&burstRejected===1,'before 15s only the 65th request overflows; queued requests remain pending');
 await clock.advance(1);check(burstRejected===61,'at exactly 15s all 60 queued tickets expire, in addition to the one overflow');releases.forEach(release=>release());const burstResult=await clock.run(burst);
 check(burstFetches===4&&burstResult.filter(r=>r.status==='rejected').length===61,'queue budget and deadline bound burst memory/source traffic');
 check(burstResult.filter(r=>r.status==='rejected'&&r.reason.message.includes('queue full')).length===1&&burstResult.filter(r=>r.status==='rejected'&&r.reason.message.includes('queue deadline')).length===60,'overflow and expired queued work fail explicitly with retry hints');
 // Each mock request has its own virtual latency. Real event-loop timing cannot
 // turn a two-second request into zero seconds or advance other requests early.
 const latencyCalendar=async(date,latency)=>{
  const starts=[],finishes=[];let inFlight=0,maxFlight=0;const start=clock.now;
  global.fetch=async url=>{
   starts.push({url:String(url),at:clock.now-start});inFlight++;maxFlight=Math.max(maxFlight,inFlight);
   await new Promise(resolve=>setTimeout(resolve,latency));
   finishes.push(clock.now-start);inFlight--;return Response.json({events:[]});
  };
  const result=await get(date);return {result,starts,finishes,maxFlight,elapsed:clock.now-start};
 };
 const healthy=await latencyCalendar('2026-11-07',2000);
 check(healthy.starts.length===32&&healthy.result.errors.length===0&&healthy.maxFlight===4&&healthy.elapsed===16000,'all 32 healthy requests complete with 2s latency without artificial missing leagues');
 check(new Set(healthy.starts.map(r=>r.url)).size===32,'all sixteen leagues receive both distinct day queries');
 check(healthy.starts.every((request,i)=>request.at===Math.floor(i/4)*2000)&&healthy.finishes.every((at,i)=>at-healthy.starts[i].at===2000),'every request really lasts two seconds in four-wide waves');
 check(healthy.starts.slice(-4).every(request=>request.at===14000)&&healthy.finishes.slice(-4).every(at=>at===16000),'last wave starts at 14s inside the 15s queue deadline and finishes at 16s');
 // The calendar dispatches a bounded number of jobs at a time. Each raw host
 // ticket retains its 15s budget (also asserted by the independent burst above).
 const late=await latencyCalendar('2026-11-08',2200);
 check(late.starts.length===32&&late.maxFlight===4&&late.elapsed===17600&&late.result.errors.length===0,'bounded calendar dispatch completes all leagues at 2.2s without extending any host queue budget');
 check(new Set(late.starts.map(request=>request.url)).size===32&&!late.result.retryAfter,'each day query runs once and complete coverage has no spurious retry metadata');
 // Independent modules model separate isolates: each has four slots. Shared R2
 // cooldown is enforced, but claiming an atomic four-request global cap is false.
 let crossFlight=0,crossMax=0;global.fetch=async()=>{crossFlight++;crossMax=Math.max(crossMax,crossFlight);await new Promise(resolve=>setTimeout(resolve,2));crossFlight--;return Response.json({ok:true})};
 await clock.run(Promise.all([fixtures.espn,cold].flatMap(fn=>Array.from({length:8},(_,i)=>fn(`https://site.api.espn.com/apis/parallel?q=${i}`,env.BUCKET)))));
 check(crossMax===8,'two isolates can have eight already in-flight calls: distributed concurrency guarantee is explicitly not claimed');
 global.fetch=async()=>new Response('',{status:429,headers:{'Retry-After':new Date(clock.now+10800000).toUTCString()}});
 await assert.rejects(()=>fixtures.espn('https://site.web.api.espn.com/apis/standings',env.BUCKET),error=>error.retryAfter===Math.floor((clock.now+10800000)/1000)*1000);
 check(values.get('referee-updates/source-backoff/site.web.api.espn.com.json').until===Math.floor((clock.now+10800000)/1000)*1000,'HTTP-date Retry-After remains intact for the standings origin');
 await clock.advance(14400000);const parallelStart=clock.now;let parallelLimit=0;const oldPut=env.BUCKET.put;
 env.BUCKET.put=async(key,value,options)=>{const parsed=JSON.parse(value);if(parsed.until===clock.now+3600000)await new Promise(resolve=>setTimeout(resolve,1));return oldPut(key,value,options)};
 global.fetch=async()=>new Response('',{status:429,headers:{'Retry-After':String(++parallelLimit===1?3600:7200)}});
 const mixed=await clock.run(Promise.allSettled(Array.from({length:4},(_,i)=>fixtures.espn(`https://site.api.espn.com/apis/limits?q=${i}`,env.BUCKET))));
 check(mixed.every(r=>r.status==='rejected')&&values.get('referee-updates/source-backoff/site.api.espn.com.json').until===parallelStart+7200000,'parallel 429 persistence cannot let a delayed shorter write replace a longer cooldown');env.BUCKET.put=oldPut;
 console.log(`PASS ${checks} calendar/provider rate-limit regressions.`);
}finally{for(const restore of restores.reverse())restore()}})().catch(error=>{console.error(error);process.exitCode=1});
