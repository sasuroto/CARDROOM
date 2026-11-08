/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node regression harness uses CommonJS. */
const {setImmediate: yieldTurn}=require('node:timers');

// One clock for Date(), new Date(), Date.now(), timers and AbortSignal.timeout.
// Native setImmediate only drains promise continuations; it never advances time.
// Supported subset: callback timers with numeric handles, Date, and timeout
// signals. Not a Node/Workers emulator: no I/O, performance, timer promises,
// ref/unref handles or concurrent advance/run calls.
// Equal-deadline timers run in registration order, with a microtask checkpoint
// after each callback, as on the event loop. No provider/network I/O belongs here.
function installClock(start,{timers=true}={}){
 const RealDate=globalThis.Date;
 let now=Number(start),nextId=0,pumping=false,restored=false;
 if(!Number.isFinite(now))throw Error('Test clock requires a finite start');
 const pending=new Map(),originals=[];
 const replace=(target,key,value)=>{originals.push([target,key,Object.getOwnPropertyDescriptor(target,key)]);Object.defineProperty(target,key,{value,writable:true,configurable:true})};
 function ClockDate(...args){
  if(!new.target)return new RealDate(now).toString();
  return Reflect.construct(RealDate,args.length?args:[now],new.target);
 }
 Object.setPrototypeOf(ClockDate,RealDate);
 ClockDate.prototype=RealDate.prototype;
 ClockDate.now=()=>now;
 replace(globalThis,'Date',ClockDate);
 const flush=()=>new Promise(resolve=>yieldTurn(resolve));
 const schedule=(fn,delay,interval,args)=>{
  if(typeof fn!=='function')throw TypeError('Test timers require a function');
  const ms=Math.max(1,Number(delay)||0),id=++nextId;
  if(!Number.isFinite(ms))throw Error('Test timers require a finite delay');
  pending.set(id,{id,at:now+ms,fn,args,interval:interval?ms:0});return id;
 };
 if(timers){
  replace(globalThis,'setTimeout',(fn,ms,...args)=>schedule(fn,ms,false,args));
  replace(globalThis,'setInterval',(fn,ms,...args)=>schedule(fn,ms,true,args));
  replace(globalThis,'clearTimeout',id=>pending.delete(id));
  replace(globalThis,'clearInterval',id=>pending.delete(id));
  replace(AbortSignal,'timeout',ms=>{
   if(typeof ms!=='number')throw TypeError('Timeout must be a number');
   if(!Number.isInteger(ms)||ms<0||ms>4294967295)throw RangeError('Timeout must be a non-negative 32-bit integer');
   const controller=new AbortController();
   schedule(()=>controller.abort(new DOMException('The operation was aborted due to timeout','TimeoutError')),ms,false,[]);
   return controller.signal;
  });
 }
 const next=()=>[...pending.values()].sort((a,b)=>a.at-b.at||a.id-b.id)[0];
 const fire=async timer=>{
  now=timer.at;
  if(timer.interval)timer.at+=timer.interval;else pending.delete(timer.id);
  timer.fn(...timer.args);
  await flush();
 };
 const pump=async work=>{
  if(pumping)throw Error('Test clock already has an active advance/run');
  pumping=true;try{return await work()}finally{pumping=false}
 };
 const advance=ms=>pump(async()=>{
  if(!Number.isFinite(ms)||ms<0)throw Error('Test clock cannot move backward or to infinity');
  const target=now+ms;await flush();
  let timer,steps=0;
  while((timer=next())&&timer.at<=target){
   if(++steps>100000)throw Error('Test clock exceeded timer budget');
   await fire(timer);
  }
  now=target;await flush();
 });
 const run=(promise,maxMs=60000)=>pump(async()=>{
  if(!Number.isFinite(maxMs)||maxMs<0)throw Error('Test clock requires a finite time budget');
  const until=now+maxMs;let done=false,value,error,failed=false,steps=0;
  Promise.resolve(promise).then(result=>{done=true;value=result},reason=>{done=true;failed=true;error=reason});
  await flush();
  while(!done){
   const timer=next();
   if(!timer||timer.at>until||++steps>100000)throw Error('Test clock could not settle work within its timer/time budget');
   await fire(timer);
  }
  if(failed)throw error;
  return value;
 });
 return {get now(){return now},flush,advance,run,restore(){
  if(restored)return;restored=true;
  pending.clear();
  for(const [target,key,descriptor] of originals.reverse()){
   if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key];
  }
 }};
}
module.exports={installClock};
