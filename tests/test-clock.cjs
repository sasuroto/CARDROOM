/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node regression harness uses CommonJS. */
const assert=require('node:assert/strict');
const {installClock}=require('./helpers/test-clock.cjs');
let checks=0;const check=(ok,message)=>{assert.ok(ok,message);checks++};
(async()=>{
 const originals={Date,setTimeout,clearTimeout,setInterval,clearInterval,timeout:AbortSignal.timeout};
 const start=Date.parse('2026-11-07T19:59:59Z'),clock=installClock(start);
 try{
  check(Date.now()===start&&new Date().getTime()===start,'Date.now and default construction share the virtual instant');
  check(Date()===new originals.Date(start).toString(),'Date called as a function uses the same instant');
  check(Date.parse('2026-11-07T19:59:59Z')===start&&Date.UTC(2026,10,7,19,59,59)===start,'Date parse and UTC remain native');
  check(new Date('2020-02-03T04:05:06Z').toISOString()==='2020-02-03T04:05:06.000Z'&&new Date(0).getTime()===0,'explicit constructor arguments are preserved');
  check(new Date() instanceof originals.Date&&new Date() instanceof Date,'Date instances retain the native prototype');
  const events=[];
  setTimeout(()=>{events.push('first');Promise.resolve().then(()=>events.push('microtask'))},1000);
  setTimeout(()=>events.push('second'),1000);
  await clock.advance(999);check(events.length===0,'timers never fire early');
  await clock.advance(1);check(events.join(',')==='first,microtask,second','equal deadlines preserve FIFO and drain promise continuations between callbacks');
  check(Date.now()===start+1000&&new Date().getTime()===start+1000,'advancing timers also advances both date APIs');
  let cancelled=false;const id=setTimeout(()=>{cancelled=true},5);clearTimeout(id);await clock.advance(5);
  check(!cancelled,'cleared timeout never runs');
  let ticks=0;const interval=setInterval(()=>{if(++ticks===3)clearInterval(interval)},10);await clock.advance(50);
  check(ticks===3,'recurring timers can cancel themselves');
  for(const ms of [-1,1.5,Infinity,NaN,4294967296]){assert.throws(()=>AbortSignal.timeout(ms),RangeError);checks++}
  assert.throws(()=>AbortSignal.timeout('20'),TypeError);checks++;
  const signal=AbortSignal.timeout(20);await clock.advance(19);check(!signal.aborted,'abort deadline is not early');await clock.advance(1);
  check(signal.aborted&&signal.reason.name==='TimeoutError','abort deadline runs on the same clock');
  const latencyStart=clock.now,result=clock.run(new Promise(resolve=>setTimeout(()=>resolve(clock.now-latencyStart),2000)));
  check(await result===2000,'run settles work at its real virtual latency');
  const running=clock.run(new Promise(resolve=>setTimeout(resolve,5)));
  await assert.rejects(clock.advance(1),/already has an active/);checks++;await running;
  const failure=Error('expected');await assert.rejects(clock.run(Promise.reject(failure)),error=>error===failure);checks++;
  await assert.rejects(clock.advance(-1),/cannot move backward/);checks++;
  await assert.rejects(clock.run(new Promise(()=>{}),10),/could not settle/);checks++;
 }finally{clock.restore();clock.restore()}
 check(Object.entries(originals).every(([key,value])=>(key==='timeout'?AbortSignal.timeout:globalThis[key])===value),'restoration reinstates all globals, including AbortSignal.timeout');
 const dateOnly=installClock(start,{timers:false});try{check(setTimeout===originals.setTimeout&&Date.now()===start,'date-only mode preserves manual component timer harnesses')}finally{dateOnly.restore()}
 console.log(`PASS ${checks} deterministic test-clock checks.`);
})().catch(error=>{console.error(error);process.exitCode=1});
