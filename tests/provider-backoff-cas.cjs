const fs=require('fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {persistProviderBackoff}=require('../lib/provider-backoff.ts');
const now=Date.parse('2026-11-02T19:00:00Z');Date.now=()=>now;
let checks=0;const check=(ok,msg)=>{assert.ok(ok,msg);checks++};
async function race(existing){
 let stored=existing?{until:now-1,status:429}:null,etag=existing?'old-etag':null,version=0,conflicts=0;
 const conditions=[];let releaseShort,shortEntered;const entered=new Promise(resolve=>{shortEntered=resolve});
 const blocked=new Promise(resolve=>{releaseShort=resolve});
 const bucket={
  get:async()=>{const snapshot=stored?structuredClone(stored):null,tag=etag;return snapshot?{etag:tag,json:async()=>snapshot}:null},
  put:async(key,value,options)=>{
   const next=JSON.parse(value),condition=options?.onlyIf;conditions.push(condition);
   assert.ok(condition,'unconditional writes are forbidden');
   if(next.until===now+3600000){shortEntered();await blocked}
   else await entered;
   const reject=condition instanceof Headers?condition.get('If-None-Match')==='*'&&stored!==null:condition.etagMatches!==etag;
   if(reject){conflicts++;return null}
   stored=next;etag='v'+(++version);if(next.until===now+7200000)releaseShort();return {etag};
  },
 };
 // Two separate module instances have independent local pools and cooldown memory.
 delete require.cache[require.resolve('../lib/espn-fetch.ts')];const A=require('../lib/espn-fetch.ts').fetchEspn;
 delete require.cache[require.resolve('../lib/espn-fetch.ts')];const B=require('../lib/espn-fetch.ts').fetchEspn;
 global.fetch=async url=>new Response('',{status:429,headers:{'Retry-After':String(url).includes('short')?'3600':'7200'}});
 const result=await Promise.allSettled([A('https://site.api.espn.com/short',bucket),B('https://site.api.espn.com/long',bucket)]);
 check(stored.until===now+7200000,'long cooldown survives delayed shorter write across independent isolates');
 check(conflicts===1&&result.every(r=>r.status==='rejected'&&r.reason.retryAfter===now+7200000&&r.reason.cooldownPersisted===true),'CAS loser reloads winning deadline and exposes confirmed persistence');
 check(existing?conditions.every(c=>c.etagMatches==='old-etag'):conditions.every(c=>c instanceof Headers&&c.get('If-None-Match')==='*'),'updates use matching ETag; initial creation uses If-None-Match wildcard');
}
(async()=>{
 await race(true);await race(false);
 let writes=0,reads=0;const target={until:now+7200000,status:429},key='cooldown';
 const contention={get:async()=>{reads++;return {etag:'v'+reads,json:async()=>({until:now+3600000,status:429})}},put:async(_key,_value,options)=>{assert.ok(options.onlyIf);writes++;return null}};
 const exhausted=await persistProviderBackoff(contention,key,target);
 check(writes===4&&reads===5&&!exhausted.persisted&&exhausted.until===target.until,'bounded four CAS attempts then readback; no unconditional fallback on contention');
 const longer={get:async()=>({etag:'long',json:async()=>({until:now+10800000,status:429})}),put:async()=>{throw Error('must not write')}};
 const retained=await persistProviderBackoff(longer,key,target);check(retained.persisted&&retained.until===now+10800000,'already longer deadline is reused without a write');
 const absent=await persistProviderBackoff(undefined,key,target);check(!absent.persisted&&absent.until===target.until,'missing storage preserves local deadline but never claims distributed persistence');
 const broken=await persistProviderBackoff({get:async()=>{throw Error('R2 unavailable')},put:async()=>{throw Error('must not write')}},key,target);check(!broken.persisted,'R2 read failure does not trigger blind overwrite');
 const noEtag=await persistProviderBackoff({get:async()=>({json:async()=>({until:now+3600000})}),put:async()=>{throw Error('must not write')}},key,target);check(!noEtag.persisted,'incompatible missing-ETag adapter cannot bypass atomicity');
 const failedWrite=await persistProviderBackoff({get:async()=>null,put:async()=>{throw Error('R2 unavailable')}},key,target);check(!failedWrite.persisted,'R2 write failure is reported honestly');
 // Same-isolate concurrent responses: a confirmed shorter restriction must
 // not make a newly extended but still unpersisted deadline look durable.
 delete require.cache[require.resolve('../lib/espn-fetch.ts')];const local=require('../lib/espn-fetch.ts').fetchEspn;
 let localValue=null,localTag=0,releaseLongWrite,longWriteEntered;
 const writeGate=new Promise(resolve=>{releaseLongWrite=resolve}),writeEntered=new Promise(resolve=>{longWriteEntered=resolve});
 const localBucket={get:async()=>localValue?{etag:String(localTag),json:async()=>structuredClone(localValue)}:null,
  put:async(_key,body)=>{const value=JSON.parse(body);if(value.until===now+7200000){longWriteEntered();await writeGate}localValue=value;return {etag:String(++localTag)}}};
 const responses=new Map();global.fetch=url=>new Promise(resolve=>responses.set(String(url),resolve));
 const shortUrl='https://site.api.espn.com/local-short',longUrl='https://site.api.espn.com/local-long';
 const shortOutcome=local(shortUrl,localBucket).catch(error=>error),longOutcome=local(longUrl,localBucket).catch(error=>error);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(responses.size,2);
 responses.get(shortUrl)(new Response('',{status:429,headers:{'Retry-After':'3600'}}));
 check((await shortOutcome).cooldownPersisted,'shorter local deadline is confirmed');
 responses.get(longUrl)(new Response('',{status:429,headers:{'Retry-After':'7200'}}));await writeEntered;
 const during=await local('https://site.api.espn.com/while-persisting',localBucket).catch(error=>error);
 check(during.retryAfter===now+7200000&&during.cooldownPersisted===false,'in-flight extension cannot borrow persistence confirmation from shorter deadline');
 releaseLongWrite();check((await longOutcome).cooldownPersisted,'extension is marked persisted only after its CAS completes');
 console.log(`PASS ${checks} provider CAS assertions, including two independent-isolate races.`);
})().catch(error=>{console.error(error);process.exitCode=1});
