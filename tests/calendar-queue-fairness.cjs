/* eslint-disable @typescript-eslint/no-require-imports -- Standalone offline regression harness. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const assert=require('node:assert/strict'),ts=require('typescript');
const {installClock}=require('./helpers/test-clock.cjs');
const root=path.resolve(process.env.CARDROOM_CALENDAR_BASE||path.join(__dirname,'..'));
const originals={fetch:global.fetch,load:Module._load,ts:require.extensions['.ts']};
const clock=installClock(Date.parse('2027-01-31T08:00:00Z'));
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const values=new Map(),etags=new Map();let revision=0,readDelay=0,writeDelay=0;
const bucket={get:async key=>{if(key.includes('source-backoff')&&readDelay)await pause(readDelay);return values.has(key)?{etag:etags.get(key)||'seed',json:async()=>structuredClone(values.get(key))}:null},
 put:async(key,value,options)=>{if(writeDelay)await pause(writeDelay);const condition=options?.onlyIf;if(condition instanceof Headers&&condition.get('If-None-Match')==='*'&&values.has(key)||condition?.etagMatches&&condition.etagMatches!==(etags.get(key)||'seed'))return null;values.set(key,JSON.parse(value));const etag=String(++revision);etags.set(key,etag);return {etag}}};
Module._load=function(id,...args){return id==='cloudflare:workers'?{env:{BUCKET:bucket}}:originals.load.call(this,id,...args)};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const source=name=>require(path.join(root,name));
function fresh(){for(const key of Object.keys(require.cache))if(key.startsWith(root+path.sep)&&key.endsWith('.ts'))delete require.cache[key];return source('app/api/matches/route.ts')}
const invoke=(route,date,league='all',upcoming=false)=>route.GET(new Request(`https://synthetic.invalid/api/matches?date=${date}&league=${league}${upcoming?'&upcoming=1':''}`)).then(response=>response.json());
const key=(date,league='all',upcoming=false)=>`fixtures/v9/${date}/${league}/${upcoming?'next':'day'}.json`;
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++};
let calls=[],active=0,max=0;
function transport(latency=0,body=()=>({events:[]})){
 calls=[];active=0;max=0;
 global.fetch=async(url,options)=>{const at=clock.now;calls.push({url:String(url),at});active++;max=Math.max(max,active);
  try{if(latency)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,latency);options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(options.signal.reason)},{once:true})});
   const result=body(String(url));return result instanceof Response?result:Response.json(result);
  }finally{active--}
 };
}
const fixture=(id,date,score='2')=>({id,date,status:{period:2,type:{state:'post',name:'STATUS_FULL_TIME',completed:true}},competitions:[{competitors:[{homeAway:'home',team:{id:'101',displayName:'Synthetic Home'},score},{homeAway:'away',team:{id:'102',displayName:'Synthetic Away'},score:'0'}]}]});
(async()=>{try{
 let route=fresh();transport(2200);let started=clock.now;
 let result=await clock.run(invoke(route,'2027-01-31'));
 console.log(`2.2s daily fixture: requests=${calls.length}, errors=${result.errors.length}, max=${max}, elapsed=${clock.now-started}ms`);
 check(calls.length===32&&result.errors.length===0&&max===4&&clock.now-started===17600,'all 16 leagues complete at 2.2s with exactly 32 calls and unchanged four-wide host guard');
 const leagues=Object.keys(source('lib/fixtures.ts').LEAGUES),providers=Object.values(source('lib/fixtures.ts').LEAGUES);
 check(new Set(calls.map(c=>c.url)).size===32,'each daily league/date query is unique');
 check(calls.every((c,i)=>c.url.endsWith('dates='+(i%2?'20270130':'20270131'))),'paired UTC day queries preserve complete league coverage before moving on');
 check(calls.every((c,i)=>c.url.includes('/'+providers[Math.floor(i/2)]+'/')),'first run stable league order');
 const unchanged=JSON.stringify(result),count=calls.length;result=await clock.run(invoke(route,'2027-01-31'));
 check(calls.length===count&&JSON.stringify(result)===unchanged,'complete cache keeps normal TTL and original timestamps without new fetches');

 // Three monthly queries are retained, rather than assuming a daily 32-job bound.
 transport(2200);started=clock.now;result=await clock.run(invoke(route,'2027-01-31','all',true));
 check(calls.length===48&&result.errors.length===0&&clock.now-started===26400&&max===4,'all 48 three-month queries finish under the dispatch window at 2.2s');
 check(new Set(calls.map(c=>new URL(c.url).searchParams.get('dates'))).size===3,'January/February/March monthly coverage remains intact');
 transport(4000);started=clock.now;result=await clock.run(invoke(route,'2027-02-01','all',true));
 // February 1 includes January 31, February and March: 48 possible requests.
 check(calls.length===32&&result.errors.length===6&&clock.now-started===32000&&max===4,'slow 48-job run dispatches only before 30s, awaits the final 4s jobs and honestly reports six incomplete leagues');
 check(calls.every(c=>c.at-started<30000)&&result.retryAfter===started+92000,'undispatched queries expose a sixty-second retry hint after cutoff, never disappear as successful');

 // Prior partial results give those leagues first chance next time, using no new schema.
 values.set(key('2027-02-02'),{events:[],competitionIds:leagues,errors:['eredivisie','bundesliga2'],checkedAt:new Date(clock.now-3600000).toISOString()});
 transport();result=await clock.run(invoke(route,'2027-02-02'));
 check(calls[0].url.includes('/ned.1/')&&calls[2].url.includes('/ger.2/'),'previously failed leagues lead the next run');
 check(calls[4].url.includes('/eng.1/')&&calls[1].url.includes('/ned.1/')&&result.competitionIds.join()===leagues.join(),'stable priority applies each date while published competition coverage keeps configured order');

 // Empty slow calendars must still rotate incomplete coverage, not starve the tail.
 values.delete(key('2027-02-13'));const covered=new Set();
 for(let pass=0;pass<3;pass++){
  transport(10000);started=clock.now;result=await clock.run(invoke(route,'2027-02-13'),120000);
  check(calls.length===12&&result.errors.length===10&&result.events.length===0&&clock.now-started===30000,'10s empty pass completes six whole leagues without false all-league failure');
  const completed=leagues.filter(id=>!result.errors.includes(id));completed.forEach(id=>covered.add(id));
  if(pass===0)check(!covered.has('bundesliga2'),'first bounded pass honestly leaves tail incomplete');
  await clock.advance(result.retryAfter-clock.now);
 }
 check(covered.size===16,'three bounded retries give every league complete day coverage, even with empty source responses');

 // Every attempted league may fail too. Never-dispatched work must still get
 // priority rather than retaining the same first six forever (review regression).
 for(const mixed of [false,true]){
  const retryDate=mixed?'2027-02-16':'2027-02-15',attempted=new Set();
  values.delete(key(retryDate));
  for(let pass=0;pass<3;pass++){
   transport(10000,()=>({invalid:true}));
   if(mixed){global.fetch=async url=>{const value=String(url);calls.push({url:value,at:clock.now});
    if(value.endsWith('dates='+retryDate.replaceAll('-','')))return Response.json({invalid:true});
    await pause(10000);return Response.json({events:[]});
   }}
   result=await clock.run(invoke(route,retryDate),120000);
   check(result.errors.length===16&&result.events.length===0&&calls.length<=32,'all attempted failures remain errors in bounded '+(mixed?'mixed':'malformed')+' pass');
   for(const call of calls)attempted.add(providers.find(p=>call.url.includes('/'+p+'/')));
   if(!mixed)check(calls.length===12,'slow malformed bodies still obey three four-wide waves');
   await clock.advance(result.retryAfter-clock.now);
  }
  check(attempted.size===16,'never-dispatched tail gets a turn across three retries despite '+(mixed?'mixed':'all')+' attempted source failures');
 }

 const monthlyAttempted=new Set();values.delete(key('2027-01-31','all',true));
 for(let pass=0;pass<4;pass++){
  transport(10000,()=>({invalid:true}));result=await clock.run(invoke(route,'2027-01-31','all',true),120000);
  check(calls.length===12&&result.errors.length===16,'48-job monthly failures remain bounded and explicit');
  for(const call of calls)monthlyAttempted.add(providers.find(p=>call.url.includes('/'+p+'/')));
  await clock.advance(result.retryAfter-clock.now);
 }
 check(monthlyAttempted.size===16,'four bounded monthly retries reach every league despite all malformed attempted responses');

 // Cache deadlines change only when the source supplies a valid explicit retry hint.
 const {calendarCacheUntil}=source('lib/calendar-requests.ts'),now=clock.now,at=new Date(now).toISOString();
 check(calendarCacheUntil(at,1800000,true,now+60000)===now+60000,'short queue retry no longer hidden behind 30-minute archive TTL');
 check(calendarCacheUntil(at,300000,true,now+1)===now+60000,'minimum partial retry cache is sixty seconds');
 for(const hint of [undefined,null,now-1])check(calendarCacheUntil(at,1800000,true,hint)===now+1800000,'missing/past hint preserves generic-failure TTL');
 for(const hint of ['bad',Infinity,NaN])check(Number.isNaN(calendarCacheUntil(at,1800000,true,hint)),'nonfinite stored retry hint is a cache miss');
 for(const stamp of ['bad',new Date(now+1).toISOString()])check(Number.isNaN(calendarCacheUntil(stamp,1800000,false,undefined)),'invalid/future checkedAt is a cache miss');
 check(calendarCacheUntil(at,300000,true,now+3600000)===now+3600000,'known hourly provider backoff suppresses repeated aggregate attempts');
 check(calendarCacheUntil(at,300000,false,now+1)===now+300000,'successful cache TTL is unchanged even if legacy retry field exists');
 values.set(key('2027-02-03'),{events:[],competitionIds:leagues,errors:['bundesliga2'],checkedAt:at,retryAfter:now+60000});transport();
 for(let i=0;i<3;i++)await clock.run(invoke(route,'2027-02-03'));
 await clock.advance(59999);result=await clock.run(invoke(route,'2027-02-03'));
 check(calls.length===0&&result.checkedAt===at,'repeated calls before exact partial retry deadline do not fetch or renew checkedAt');
 await clock.advance(1);result=await clock.run(invoke(route,'2027-02-03'));
 check(calls.length===32&&result.errors.length===0&&calls[0].url.includes('/ger.2/'),'exact retry deadline allows one normal full attempt, prioritizing failed league');
 await clock.run(invoke(route,'2027-02-03'));check(calls.length===32,'immediate caller reuses recovered cache instead of rapid duplicate fetch');

 for(const status of [403,429]){
  values.clear();route=fresh();transport(5,()=>new Response('',{status,headers:{'Retry-After':'3600'}}));started=clock.now;
  result=await clock.run(invoke(route,'2027-02-04'));
  check(calls.length===4&&result.errors.length===16&&result.retryAfter>=started+(status===403?21600000:3600000),status+' stops provider requests after at most the first four');
  const deadline=result.retryAfter,snapshot=JSON.stringify(result);await clock.advance(1800000);
  result=await clock.run(invoke(route,'2027-02-04'));
  check(calls.length===4&&JSON.stringify(result)===snapshot,status+' partial response remains cached across normal archive TTL without renewal');
  await clock.advance(deadline-clock.now);transport();result=await clock.run(invoke(route,'2027-02-04'));
  check(calls.length===32&&result.errors.length===0&&!result.retryAfter,status+' expires honestly and permits recovery');
 }
 // Cached shorter retry cannot override a later persisted provider cooldown.
 values.clear();route=fresh();const later=clock.now+3600000;
 values.set(key('2027-02-05'),{events:[],competitionIds:leagues,errors:['epl'],checkedAt:new Date(clock.now-60001).toISOString(),retryAfter:clock.now-1});
 values.set('referee-updates/source-backoff/site.api.espn.com.json',{until:later,status:429});transport();
 result=await clock.run(invoke(route,'2027-02-05'));check(calls.length===0&&result.retryAfter===later&&result.errors.length===16,'expired aggregate cache cannot bypass later persisted host cooldown');

 // Route retention includes actual date filtering, fresh source evidence and failed fallback.
 values.clear();route=fresh();const date='2027-02-06',oldAt=new Date(clock.now-3600000).toISOString();
 const saved={id:'saved-unknown',league:'bundesliga2',home:'Known Home',away:'Known Away',date:date+'T12:00Z',state:'post',period:2,homeScore:'3',awayScore:'0',statusSource:'https://example.invalid/confirmed',statusCheckedAt:oldAt,checkedAt:oldAt};
 values.set(key(date),{events:[saved],competitionIds:leagues,errors:[],checkedAt:oldAt});
 transport(0,url=>url.includes('/ger.2/')?{invalid:true}:{events:[fixture('new-'+providers.findIndex(p=>url.includes('/'+p+'/')),'2027-02-05T21:00Z'),fixture('outside','2027-02-06T21:00Z')]});started=clock.now;
 result=await clock.run(invoke(route,date));
 check(result.errors.join()==='bundesliga2'&&result.events.length===16,'only failed league reuses dated cache; previous UTC date retained and next local day excluded');
 const retained=result.events.find(e=>e.id===saved.id),received=result.events.find(e=>e.id.startsWith('new-'));
 check(retained.homeScore==='3'&&retained.statusSource===saved.statusSource&&retained.statusCheckedAt===oldAt&&retained.statusStale&&retained.stale,'failed league preserves confirmed value/source/time with explicit stale flags');
 check(received.period===2&&received.homeId==='101'&&received.homeScore==='2'&&received.awayScore==='0'&&received.statusCheckedAt===new Date(started).toISOString()&&!received.statusStale&&received.statusSource.includes(received.id),'received statuses preserve identity, genuine zero, source and attempt timestamp');
 check(result.journal&&result.journal.status==='unconfigured','existing journal acknowledgement remains visible without a bound database');

 // Every caller owns its jobs. Three overlapping calendars share only numeric host tickets.
 values.clear();route=fresh();transport(2200);started=clock.now;
 const concurrent=await clock.run(Promise.all(['2027-02-07','2027-02-08','2027-02-09'].map(d=>invoke(route,d))),120000);
 check(max===4&&calls.length<=96&&new Set(calls.map(c=>c.url)).size<=96,'overlapping callers retain local host cap and finite per-request work');
 check(concurrent.every(r=>r.errors.length>0&&r.retryAfter>started)&&active===0,'congested callers report incomplete coverage and await all owned I/O');
 console.log(`Three overlapping calendars: requests=${calls.length}/96, errors=${concurrent.map(r=>r.errors.length).join('/')}, elapsed=${clock.now-started}ms`);

 // Slow R2 reads use existing active leases; no new provider fetch starts after expiry.
 values.clear();route=fresh();transport(2200);readDelay=31000;started=clock.now;
 result=await clock.run(invoke(route,'2027-02-10'),120000);readDelay=0;
 check(calls.length===0&&result.errors.length===16&&clock.now-started===31000&&active===0,'31s guard reads outlive their leases, prevent provider I/O and still await storage completion');
 values.clear();route=fresh();transport(2200);readDelay=1000;writeDelay=5000;started=clock.now;
 result=await clock.run(invoke(route,'2027-02-11'),120000);readDelay=writeDelay=0;
 check(calls.length===32&&result.errors.length===0&&max===4&&clock.now-started===30600,'1s admission reads plus 5s result write extend wall time without dropping leagues or fabricating a 30s total deadline');

 // The dispatch window is not a total deadline: a job submitted before cutoff
 // may finish its original guard read/fetch afterward and must be awaited.
 values.clear();route=fresh();transport(7000);readDelay=7000;started=clock.now;
 result=await clock.run(invoke(route,'2027-02-14'),120000);readDelay=0;
 check(calls.length===12&&result.errors.length===10&&clock.now-started===42000&&calls.some(c=>c.at-started===35000)&&active===0,'last jobs submitted at 28s wait for R2 then start at 35s and finish at 42s under unchanged guards');

 // Fetch timeouts remain failures, never empty successful calendars or automatic retries.
 values.clear();route=fresh();transport(13000);started=clock.now;
 result=await clock.run(invoke(route,'2027-02-12'),120000);
 check(calls.length===12&&result.errors.length===16&&clock.now-started===36000&&active===0,'12s abort remains active; 30s dispatch cutoff prevents unlimited timeout waves');
 console.log(`PASS ${checks} bounded calendar fairness/cache regressions; offline fixtures only.`);
}finally{clock.restore();global.fetch=originals.fetch;Module._load=originals.load;if(originals.ts)require.extensions['.ts']=originals.ts;else delete require.extensions['.ts']}})().catch(error=>{console.error(error);process.exitCode=1});
