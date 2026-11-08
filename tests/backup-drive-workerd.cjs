/* Actual production module in workerd, with isolated D1 and synthetic identity only.
 * outboundService intercepts EVERY fetch: no real Google, credentials or storage. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module'),ts=require('typescript');
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const root=path.resolve(__dirname,'..');
const tokenUrl='https://oauth2.googleapis.com/token';
const accountUrl='https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)';
const scope='https://www.googleapis.com/auth/drive.file';
const moduleSource=ts.transpileModule(fs.readFileSync(path.join(root,'lib/backup-drive.server.ts'),'utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
}).outputText;
// Observe the actual production fetch options, then call native workerd fetch unchanged.
// Never replace fetch with a Node mock or patch production redirect handling.
const script=`import {startDrive,finishDrive,driveStatus,SITE_ORIGIN,CALLBACK_PATH} from './backup-drive.js';
const nativeFetch=globalThis.fetch;let audits=[];
globalThis.fetch=(url,options)=>{
 audits.push({manual:options.redirect==='manual',noStore:options.cache==='no-store',
  signal:options.signal instanceof AbortSignal,
  form:url!=='${tokenUrl}'||options.body instanceof URLSearchParams});
 return nativeFetch(url,options);
};
export default {async fetch(request,bindings){
 audits=[];
 const env={DB:bindings.DB,CARDROOM_DRIVE_ENABLED:'true',CARDROOM_BACKUP_OWNER_ID:'synthetic-workerd-owner',
  CARDROOM_DRIVE_CLIENT_ID:'synthetic-workerd-client.apps.googleusercontent.com',
  CARDROOM_DRIVE_CLIENT_SECRET:'synthetic-not-a-client-secret',CARDROOM_DRIVE_TOKEN_KEY:'${Buffer.alloc(32,9).toString('base64url')}',
  CARDROOM_DRIVE_ACCOUNT_EMAIL:'synthetic-owner@example.test',CARDROOM_DRIVE_OAUTH_MODE:'testing'};
 const headers={'oai-authenticated-user-id':env.CARDROOM_BACKUP_OWNER_ID,Origin:SITE_ORIGIN,'Sec-Fetch-Site':'same-origin'};
 const req=(route,method='GET',h=headers)=>new Request(SITE_ORIGIN+route,{method,headers:h});
 if(new URL(request.url).pathname==='/status')return driveStatus(req('/api/backup-drive/status'),env);
 const start=await startDrive(req('/api/backup-drive/start','POST'),env);
 let result=start;
 if(start.status===303){
  const state=new URL(start.headers.get('Location')).searchParams.get('state');
  result=await finishDrive(req(CALLBACK_PATH+'?state='+state+'&code=synthetic-not-an-oauth-code','GET',{
   'oai-authenticated-user-id':env.CARDROOM_BACKUP_OWNER_ID,Cookie:start.headers.get('Set-Cookie').split(';')[0]}),env);
 }
 return Response.json({status:result.status,body:result.status===303?null:await result.json(),audits,
  storedRedirect:result.status===303&&result.headers.get('Location')===SITE_ORIGIN+'/api/backup-drive/status'});
}};`;
async function run(){
 let checks=0,calls=[],fixtureStage=null,fixtureStatus=200;
 const check=(condition,label)=>{assert.ok(condition,label);checks++};
 const mf=new Miniflare({modules:[{type:'ESModule',path:'worker.js',contents:script},
  {type:'ESModule',path:'backup-drive.js',contents:moduleSource}],
  compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],
  outboundService:async request=>{
   const url=request.url;calls.push(url);
   // Unknown destinations are intercepted too, never forwarded to a network.
   if(url!==tokenUrl&&url!==accountUrl)return new Response('synthetic blocked destination',{status:599});
   const stage=url===tokenUrl?'token':'account';
   check(request.method===(stage==='token'?'POST':'GET'),'fixed provider method');
   if(stage==='token'){
    const form=new URLSearchParams(await request.text());
    check(form.get('code')==='synthetic-not-an-oauth-code'&&form.get('client_secret')==='synthetic-not-a-client-secret'&&
     /^[\w-]{43}$/.test(form.get('code_verifier')),'synthetic form survives native fetch');
   }else check(request.headers.get('Authorization')==='Bearer synthetic-access','synthetic account authorization');
   if(stage===fixtureStage)return new Response(fixtureStatus===304?null:'not JSON: synthetic redirect body',{status:fixtureStatus,
    headers:{Location:'https://must-not-follow.invalid/synthetic-destination','Retry-After':'7200'}});
   return Response.json(stage==='token'?{token_type:'Bearer',scope,access_token:'synthetic-access',refresh_token:'synthetic-refresh'}:
    {user:{emailAddress:'synthetic-owner@example.test',permissionId:'synthetic-permission'}});
  }});
 try{
  await mf.ready;
  const db=await mf.getD1Database('DB');
  for(const statement of fs.readFileSync(path.join(root,'drizzle/0001_strong_black_knight.sql'),'utf8').split('--> statement-breakpoint'))await db.prepare(statement.trim()).run();
  const connection=()=>db.prepare("SELECT owner,revision,sealed FROM backup_drive_connection WHERE id='primary'").first();
  const flow=()=>db.prepare("SELECT consumed_at,retry_at,last_error FROM backup_drive_flow WHERE id='primary'").first();
  const call=async route=>(await mf.dispatchFetch('https://synthetic-harness.invalid'+route)).json();
  const audit=result=>check(result.audits.every(a=>a.manual&&a.noStore&&a.signal&&a.form),'production fetch keeps manual/no-store/signal/form');
  let result=await call('/connect');audit(result);
  check(result.status===303&&result.storedRedirect,'valid exchange succeeds in native workerd');
  check(calls.length===2&&calls[0]===tokenUrl&&calls[1]===accountUrl,'exactly token and about destinations');
  const original=JSON.stringify(await connection());
  check(!original.includes('synthetic-refresh')&&!original.includes('synthetic-owner@example.test'),'stored grant is sealed');
  const stored=await call('/status');
  check(stored.status==='credential-stored'&&stored.persisted,'separate request decrypts persisted D1 grant');
  check(!stored.offsiteVerified&&!stored.backupEnabled&&calls.length===2,'local status makes no provider call or backup claim');
  // Include non-followed 3xx statuses as well as all standard redirect statuses.
  for(const stage of ['token','account'])for(const status of [300,301,302,303,304,305,306,307,308,399]){
   // Reset only this test's pending flow; keep the confirmed connection untouched.
   await db.prepare('DELETE FROM backup_drive_flow').run();
   fixtureStage=stage;fixtureStatus=status;const before=calls.length,started=Date.now();
   result=await call('/connect');const ended=Date.now();audit(result);
   const expected='google-'+stage+'-redirect-refused',saved=await flow();
   check(result.status===502&&result.body.reason===expected,'reject '+stage+' HTTP '+status+' before JSON/body processing');
   check(result.audits.length===(stage==='token'?1:2)&&calls.length-before===result.audits.length,'no follow-up fetch or automatic retry');
   check(calls.slice(before).every((url,i)=>url===(i===0?tokenUrl:accountUrl)),'no Location destination fetched');
   check(saved.last_error===expected&&saved.consumed_at!==null,'finite failure stored and one-use state consumed');
   check(saved.retry_at>=started+300000&&saved.retry_at<=ended+300000&&Date.parse(result.body.retryAt)===saved.retry_at,
    'five-minute cooldown persisted, ignoring redirect Retry-After');
   check(JSON.stringify(await connection())===original,'redirect preserves confirmed connection');
   const cooldown=await call('/connect');
   check(cooldown.status===429&&cooldown.body.reason==='cooldown'&&cooldown.audits.length===0,'new start respects cooldown');
   const statusReadback=await call('/status');
   check(statusReadback.status==='credential-stored'&&statusReadback.persisted&&Date.parse(statusReadback.retryAt)===saved.retry_at,
    'stored connection and cooldown remain readable');
   check(calls.length-before===(stage==='token'?1:2),'cooldown and status make no outbound calls');
  }
  console.log('Backup Drive workerd: '+checks+' checks passed; native fetch, isolated D1, synthetic fixtures, no external network.');
 }finally{await mf.dispose()}
}
// Avoid dumping request bodies, cookies, state, tokens or sealed data on failure.
run().catch(error=>{console.error('Backup Drive workerd failed: '+(error instanceof assert.AssertionError?error.message:'harness/runtime failure'));process.exitCode=1});
