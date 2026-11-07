/* eslint-disable @typescript-eslint/no-require-imports -- Matches the repository CommonJS TypeScript test harness. */
// Synthetic HTTP requests and mocked runner only. No real identities or providers.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const U=require('../lib/backup-drive-upload.server.ts'),R=require('../lib/backup-drive-upload-route.server.ts'),{SITE_ORIGIN}=require('../lib/backup-drive.server.ts');
let checks=0,calls=0,dbReads=0;const check=(v,m)=>{assert.ok(v,m);checks++};
const action=JSON.stringify({action:'create-one-backup'}),env={CARDROOM_BACKUP_OWNER_ID:'synthetic-owner',DB:{prepare(){dbReads++;throw Error('unexpected storage access')}}};
const headers={'oai-authenticated-user-id':'synthetic-owner',Origin:SITE_ORIGIN,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
const request=(patch={})=>{const {path='/api/backup-drive/upload',method='POST',headers:h={},body=action,...more}=patch;return new Request(SITE_ORIGIN+path,{method,headers:{...headers,...h},...(method==='GET'||method==='HEAD'?{}:{body}),...more})};
const pristine=U.runDriveBackup;let runner=async()=>({status:'uploaded-verified',uploadVerified:true,captureAtomic:false,offsiteVerified:false,restoreDrillVerified:false,backupEnabled:false,attemptId:'c1aabcde-1234-4567-9abc-123456789012',fileId:'synthetic_file_123',completedAt:'2026-11-07T18:00:00Z'});
U.runDriveBackup=async(...args)=>{calls++;return runner(...args)};
global.fetch=()=>{throw Error('network forbidden')};
async function reason(req,e,status,why){const before=calls,r=await R.driveUploadRoute(req,e),body=await r.json();check(r.status===status&&body.reason===why,why+': '+JSON.stringify(body));check(calls===before,'boundary rejection never invokes runner');return r}
(async()=>{
 for(const method of ['GET','HEAD','OPTIONS','PUT','PATCH','DELETE']){const r=await reason(request({method}),env,405,'method-not-allowed');check(r.headers.get('Allow')==='POST','only POST advertised')}
 await reason(new Request('https://other.test/api/backup-drive/upload',{method:'POST',headers,body:action}),env,400,'invalid-request-target');
 for(const path of ['/api/backup-drive/upload?file=private','/api/backup-drive/status'])await reason(request({path}),env,400,'invalid-request-target');
 const anonymous=request();anonymous.headers.delete('oai-authenticated-user-id');await reason(anonymous,env,401,'owner-required');
 await reason(request({headers:{'oai-authenticated-user-id':'other'}}),env,403,'owner-required');
 await reason(request(),{},503,'owner-unconfigured');
 await reason(request({headers:{'oai-authenticated-user-id':'x'.repeat(257)}}),env,403,'owner-required');
 for(const Origin of ['null','https://other.test',''])await reason(request({headers:{Origin}}),env,403,'wrong-origin');
 for(const site of ['cross-site','same-site','none'])await reason(request({headers:{'Sec-Fetch-Site':site}}),env,403,'wrong-origin');
 for(const type of ['text/plain','application/x-www-form-urlencoded','multipart/form-data',''])await reason(request({headers:{'Content-Type':type}}),env,415,'json-required');
 for(const body of ['{}','[]','null','',JSON.stringify({action:'create-one-backup',folder:'evil'}),JSON.stringify({action:'restore'}),'{'])await reason(request({body}),env,400,'explicit-action-required');
 for(const value of ['129','9999','-1','hidden'])await reason(request({headers:{'Content-Length':value}}),env,413,'body-too-large');
 await reason(request({body:'x'.repeat(129)}),env,413,'body-too-large');
 await reason(request({body:new Uint8Array([0xff])}),env,400,'explicit-action-required');
 const realTimeout=global.setTimeout;global.setTimeout=(fn,ms,...args)=>realTimeout(fn,ms===2000?5:ms,...args);
 try{await reason(request({body:new ReadableStream({start(){}}),duplex:'half'}),env,408,'body-timeout')}finally{global.setTimeout=realTimeout}
 let emptyChunks=0;await reason(request({body:new ReadableStream({pull(c){emptyChunks++;c.enqueue(new Uint8Array())}}),duplex:'half'}),env,413,'body-too-large');check(emptyChunks<=130,'empty chunks bounded against timer starvation');
 check(dbReads===0&&calls===0,'every unauthorized/malformed request blocked before storage or uploader');
 let r=await R.driveUploadRoute(request(),env),b=await r.json();check(r.status===201&&b.uploadVerified&&!b.offsiteVerified&&!b.restoreDrillVerified&&!b.backupEnabled&&!b.captureAtomic,'manual transfer remains explicit about coverage');
 for(const [k,v] of Object.entries({'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow'}))check(r.headers.get(k)===v,'security header '+k);
 check(!r.headers.has('Access-Control-Allow-Origin')&&!r.headers.has('Set-Cookie'),'no CORS grant or cookie changes');
 check(r.headers.get('Content-Security-Policy').includes("default-src 'none'")&&r.headers.get('Vary').includes('oai-authenticated-user-id'),'CSP and identity cache boundary');
 const good=await runner();runner=async()=>({...good,status:'already-uploaded',secret:'HIDDEN_TOKEN',archive:{payload:'HIDDEN_PAYLOAD'}});
 r=await R.driveUploadRoute(request({headers:{'Content-Type':'application/json; charset=utf-8'}}),env);check(r.status===200&&!(await r.text()).includes('HIDDEN'),'idempotent success and projected reply exclude arbitrary fields');
 const cases=[['upload-disabled',503],['upload-in-progress',409],['not-connected',409],['private-folder-required',502],['reauthorization-required',409],['google-rate-limited',429],['cooldown',429],['upload-persistence-unconfirmed',503]];
 for(const [why,status] of cases){runner=async()=>({status:'error',reason:why,retryAt:new Date(Date.now()+3600000).toISOString(),secret:'HIDDEN'});r=await R.driveUploadRoute(request(),env);b=await r.json();check(r.status===status&&b.reason===why&&!JSON.stringify(b).includes('HIDDEN'),why+' preserves safe HTTP status');if(status===429)check(Number(r.headers.get('Retry-After'))>0,'bounded retry header')}
 runner=async()=>({status:'error',reason:'sensitive-provider-value',retryAt:'HIDDEN'});r=await R.driveUploadRoute(request(),env);b=await r.json();check(r.status===503&&b.reason==='backup-validation-or-storage-failed'&&b.retryAt===null,'unknown reason/data never reflected');
 for(const patch of [{uploadVerified:false},{offsiteVerified:true},{restoreDrillVerified:true},{backupEnabled:true},{captureAtomic:true},{fileId:'https://evil.test?token=hidden'},{completedAt:'bad'},{attemptId:'secret'}]){
  runner=async()=>({...good,...patch});r=await R.driveUploadRoute(request(),env);check(r.status===503&&(await r.json()).reason==='backup-result-unconfirmed','invalid success cannot be returned');
 }
 runner=async()=>{throw Error('HIDDEN_RUNTIME_SECRET')};r=await R.driveUploadRoute(request(),env);check(r.status===503&&!(await r.text()).includes('HIDDEN'),'exceptions redacted');
 U.runDriveBackup=pristine;
 const load=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env}:load.call(this,id,...args)};
 let route;try{route=require('../app/api/backup-drive/upload/route.ts')}finally{Module._load=load}
 r=await route.POST(request());check(r.status===503&&(await r.json()).reason==='upload-disabled'&&dbReads===0,'real route defaults disabled with no storage/provider access');
 for(const method of ['GET','HEAD','OPTIONS','PUT','PATCH','DELETE']){r=await route[method](request({method}));check(r.status===405&&dbReads===0,'real route rejects '+method)}
 check(!fs.readFileSync('lib/backup-drive-page.server.ts','utf8').includes('/api/backup-drive/upload'),'existing page has no upload UI');
 console.log(`Drive upload HTTP boundary: ${checks} checks passed; no live access.`);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{U.runDriveBackup=pristine});
