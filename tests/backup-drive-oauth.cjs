// Synthetic credentials and in-memory SQLite only. Never calls Google or live storage.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const O=require('../lib/backup-drive.server.ts');
const sql=new DatabaseSync(':memory:');
sql.exec(fs.readFileSync('drizzle/0000_tough_mathemanic.sql','utf8'));
sql.exec(fs.readFileSync('drizzle/0001_strong_black_knight.sql','utf8'));
let reads=0,writes=0,calls=[],queue=[],clock=Date.parse('2026-11-06T13:30:00Z'),checks=0;
const realNow=Date.now;Date.now=()=>clock;
const check=(v,label)=>{assert.ok(v,label);checks++};
const db={prepare(q){const operation=(args)=>({
 first:async()=>{if(/^(INSERT|UPDATE|DELETE)/.test(q))writes++;else reads++;return sql.prepare(q).get(...args)||null},
 run:async()=>{writes++;return sql.prepare(q).run(...args)},
 });return {...operation([]),bind:(...args)=>operation(args)}}};
const env={DB:db,CARDROOM_DRIVE_ENABLED:'true',CARDROOM_BACKUP_OWNER_ID:'fixture-site-owner',
 CARDROOM_DRIVE_CLIENT_ID:'fixture-client.apps.googleusercontent.com',CARDROOM_DRIVE_CLIENT_SECRET:'fixture-only-secret',
 CARDROOM_DRIVE_TOKEN_KEY:Buffer.alloc(32,9).toString('base64url'),CARDROOM_DRIVE_ACCOUNT_EMAIL:'owner@example.test',CARDROOM_DRIVE_OAUTH_MODE:'testing'};
const H={'oai-authenticated-user-id':env.CARDROOM_BACKUP_OWNER_ID,Origin:O.SITE_ORIGIN,'Sec-Fetch-Site':'same-origin'};
const req=(path,method='GET',headers=H)=>new Request(O.SITE_ORIGIN+path,{method,headers});
const first=()=>sql.prepare("SELECT * FROM backup_drive_flow WHERE id='primary'").get();
const connection=()=>sql.prepare("SELECT * FROM backup_drive_connection WHERE id='primary'").get();
const validToken={token_type:'Bearer',scope:O.DRIVE_SCOPE,access_token:'fixture-access',refresh_token:'fixture-refresh'};
const validAccount={user:{emailAddress:'owner@example.test',permissionId:'fixture-permission'}};
global.fetch=async(url,options)=>{
 calls.push({url,options});assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(options.signal);
 assert.ok(['https://oauth2.googleapis.com/token','https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)'].includes(url));
 assert.ok(queue.length,'unexpected network request');const item=queue.shift();return typeof item==='function'?item(url,options):item;
};
function google(token=validToken,account=validAccount){queue.push(Response.json(token),Response.json(account))}
async function begin(e=env){clock+=61000;return O.startDrive(req('/api/backup-drive/start','POST'),e)}
function callback(start,extras=''){
 const state=new URL(start.headers.get('Location')).searchParams.get('state');
 return req(O.CALLBACK_PATH+'?state='+state+'&code=fixture-code'+extras,'GET',{
  'oai-authenticated-user-id':env.CARDROOM_BACKUP_OWNER_ID,Cookie:start.headers.get('Set-Cookie').split(';')[0]});
}
async function reason(response,expected){const body=await response.json();check(body.reason===expected,expected);return body}
function resetFlow(){sql.exec('DELETE FROM backup_drive_flow');queue=[]}
(async()=>{
 await reason(await O.startDrive(req('/api/backup-drive/start','POST'),{}),'disabled');
 for(const key of ['DB','CARDROOM_BACKUP_OWNER_ID','CARDROOM_DRIVE_CLIENT_ID','CARDROOM_DRIVE_CLIENT_SECRET','CARDROOM_DRIVE_TOKEN_KEY','CARDROOM_DRIVE_ACCOUNT_EMAIL','CARDROOM_DRIVE_OAUTH_MODE']){
  const e={...env};delete e[key];await reason(await O.startDrive(req('/api/backup-drive/start','POST'),e),'unconfigured');
 }
 await reason(await O.startDrive(req('/api/backup-drive/start')),'method-not-allowed');
 await reason(await O.startDrive(req('/api/backup-drive/start','POST',{}),env),'owner-required');
 await reason(await O.startDrive(req('/api/backup-drive/start','POST',{'OAI-Sites-Authorization':'Bearer synthetic-service-token'}),env),'owner-required');
 for(const patch of [{Origin:'https://attacker.test'}, {Origin:'null'}, {'Sec-Fetch-Site':'cross-site'}]){
  await reason(await O.startDrive(req('/api/backup-drive/start','POST',{...H,...patch}),env),'wrong-origin');
 }
 await reason(await O.startDrive(new Request('https://attacker.test/api/backup-drive/start',{method:'POST',headers:H}),env),'wrong-origin');
 check(!writes&&!calls.length,'all preconditions fail without storage or provider writes');
 let r=await O.driveStatus(req('/api/backup-drive/status'),env);check((await r.json()).status==='not-connected'&&!writes&&!calls.length,'read-only missing status');
 let start=await begin();check(start.status===303,'start redirects to Google');
 const url=new URL(start.headers.get('Location')),p=url.searchParams,flow=first();
 check(url.origin==='https://accounts.google.com'&&p.get('scope')===O.DRIVE_SCOPE&&p.get('access_type')==='offline'&&p.get('include_granted_scopes')==='false','least-privilege offline grant');
 check(p.get('redirect_uri')===O.CALLBACK_URI&&p.get('code_challenge_method')==='S256'&&p.get('code_challenge').length===43,'fixed callback and PKCE');
 check(start.headers.get('Set-Cookie').includes('HttpOnly; Secure; SameSite=Lax')&&start.headers.get('Cache-Control').includes('no-store'),'host cookie and no cache');
 check(!flow.sealed.includes('verifier')&&flow.state_hash!==p.get('state')&&!flow.sealed.includes(env.CARDROOM_DRIVE_CLIENT_SECRET),'no plaintext state secrets');
 await reason(await O.startDrive(req('/api/backup-drive/start','POST'),env),'cooldown');
 const cb=callback(start),wrongCookie=new Request(cb.url,{headers:{...H,Cookie:'__Host-cardroom-drive='+'a'.repeat(43)}});
 await reason(await O.finishDrive(wrongCookie,env),'expired-or-used-state');
 check(first().consumed_at===null&&!calls.length,'wrong browser cannot consume or exchange');
 await reason(await O.finishDrive(new Request(cb.url,{headers:{...H,Cookie:cb.headers.get('Cookie')+'; '+cb.headers.get('Cookie')}}),env),'invalid-session');
 await reason(await O.finishDrive(callback(start,'&state=duplicate'),env),'invalid-callback');
 google();r=await O.finishDrive(cb,env);check(r.status===303&&r.headers.get('Location')===O.SITE_ORIGIN+'/api/backup-drive/status','successful callback strips auth code');
 check(calls.length===2&&queue.length===0,'one exchange and one account check');
 const exchange=calls[0].options.body;check(exchange.get('code')==='fixture-code'&&exchange.get('client_secret')===env.CARDROOM_DRIVE_CLIENT_SECRET&&exchange.get('code_verifier').length===43,'code and secret sent in body, verifier provided');
 check(!calls[0].url.includes('fixture')&&calls[1].options.headers.Authorization==='Bearer fixture-access','tokens only body/header on fixed destinations');
 check(!JSON.stringify(connection()).includes('fixture-refresh')&&!JSON.stringify(connection()).includes('owner@example.test'),'token and account encrypted in DB');
 const original=JSON.stringify(connection());
 const replay=await O.finishDrive(cb,env);await reason(replay,'expired-or-used-state');check(calls.length===2,'replay never calls provider');
 check(!replay.headers.has('Set-Cookie')&&!r.headers.has('Set-Cookie'),'success and replay cannot erase a newer browser cookie');
 const n=writes;r=await O.driveStatus(req('/api/backup-drive/status'),env);const status=await r.json();
 check(status.status==='credential-stored'&&status.persisted&&status.reauthorizeBy===new Date(clock+7*86400000).toISOString(),'testing expiry and readback reported');
 check(!status.backupEnabled&&!status.offsiteVerified&&!status.folderAccessVerified&&!status.providerAccessVerifiedNow&&writes===n&&calls.length===2,'no false backup or freshness claims');
 check(!JSON.stringify(status).includes('fixture')&&!JSON.stringify(status).includes('example.test'),'status leaks no token or account');
 for(const patch of [{CARDROOM_DRIVE_TOKEN_KEY:Buffer.alloc(32,7).toString('base64url')},{CARDROOM_DRIVE_CLIENT_ID:'different.apps.googleusercontent.com'},{CARDROOM_DRIVE_ACCOUNT_EMAIL:'different@example.test'}]){
  await reason(await O.driveStatus(req('/api/backup-drive/status'),{...env,...patch}),'invalid-sealed-data');
 }
 sql.prepare("UPDATE backup_drive_connection SET sealed=? WHERE id='primary'").run(connection().sealed.slice(0,-4)+'AAAA');
 await reason(await O.driveStatus(req('/api/backup-drive/status'),env),'invalid-sealed-data');
 sql.prepare("UPDATE backup_drive_connection SET sealed=? WHERE id='primary'").run(JSON.parse(original).sealed);
 start=await begin();clock+=11*60000;await reason(await O.finishDrive(callback(start),env),'expired-or-used-state');
 check(JSON.stringify(connection())===original,'expired flow preserves connection');
 start=await begin();const cancelled=callback(start);await reason(await O.finishDrive(new Request(cancelled.url.replace('code=fixture-code','error=access_denied'),{headers:cancelled.headers}),env),'consent-not-granted');
 check(JSON.stringify(connection())===original,'denied consent preserves connection');
 start=await begin();google(validToken,{user:{emailAddress:'wrong@example.test',permissionId:'wrong'}});
 await reason(await O.finishDrive(callback(start),env),'google-account-mismatch');check(JSON.stringify(connection())===original,'wrong Google account preserves connection');
 for(const patch of [{refresh_token:undefined},{token_type:'mac'},{scope:O.DRIVE_SCOPE+' https://www.googleapis.com/auth/drive'}]){
  start=await begin();queue.push(Response.json({...validToken,...patch}));await reason(await O.finishDrive(callback(start),env),'offline-grant-incomplete');
  check(JSON.stringify(connection())===original,'incomplete or broad grant preserves old token');
 }
 for(const http of [403,429,500]){
  resetFlow();start=await begin();queue.push(new Response('DO NOT EXPOSE',{status:http,headers:{'Retry-After':'7200'}}));
  const failed=await O.finishDrive(callback(start),env),body=await reason(failed,'google-token-http-'+http);
  check(Date.parse(body.retryAt)>=clock+7200000&&first().retry_at>=clock+7200000,'provider retry persisted');
  await reason(await O.startDrive(req('/api/backup-drive/start','POST'),env),'cooldown');
  check(JSON.stringify(connection())===original&&queue.length===0,'no automatic retry or token overwrite');
 }
 resetFlow();start=await begin();queue.push(Response.json(validToken),new Response('secret-body',{status:403}));
 await reason(await O.finishDrive(callback(start),env),'google-account-http-403');check(JSON.stringify(connection())===original,'account denial preserves old token');
 resetFlow();start=await begin();queue.push(()=>{throw Error('redirected URL with SECRET')});
 const network=await O.finishDrive(callback(start),env);await reason(network,'google-request-failed');check(first().retry_at>clock,'network failure persists cooldown');
 resetFlow();start=await begin();queue.push(new Response('x'.repeat(33000)));await reason(await O.finishDrive(callback(start),env),'google-response-too-large');
 resetFlow();start=await begin();queue.push(new Response('{bad'));await reason(await O.finishDrive(callback(start),env),'google-invalid-response');
 resetFlow();start=await begin();google({...validToken,refresh_token_expires_in:3600});
 await O.finishDrive(callback(start),env);check((await (await O.driveStatus(req('/api/backup-drive/status'),env)).json()).reauthorizeBy===new Date(clock+3600000).toISOString(),'honours shorter provider expiry');
 clock+=3600001;check((await (await O.driveStatus(req('/api/backup-drive/status'),env)).json()).status==='reauthorization-required','expired token not claimed ready');
 resetFlow();start=await begin();let release;
 const held=new Promise(resolve=>release=resolve);queue.push(()=>held,Response.json(validAccount));
 const pending=O.finishDrive(callback(start),env);while(!first().consumed_at)await new Promise(resolve=>setImmediate(resolve));
 const newer=await begin(),beforeRace=JSON.stringify(connection());release(Response.json(validToken));
 const superseded=await pending;await reason(superseded,'connection-superseded');check(JSON.stringify(connection())===beforeRace,'slow previous callback cannot replace newer flow');
 check(!superseded.headers.has('Set-Cookie'),'slow callback cannot delete newer flow cookie');
 google();const attempts=await Promise.all([O.finishDrive(callback(newer),env),O.finishDrive(callback(newer),env)]);
 check(attempts.filter(v=>v.status===303).length===1&&attempts.filter(v=>v.status===400).length===1&&queue.length===0,'concurrent callback exactly one exchange');
 check(attempts.every(v=>!v.headers.has('Set-Cookie')),'concurrent callback responses never replace newer cookie');
 for(const removeRow of [false,true]){
  resetFlow();start=await begin();queue.push(new Response('hidden',{status:429}));
  const lost={...env,DB:{prepare(q){
   const s=db.prepare(q);
   return {...s,bind(...args){
    const bound=s.bind(...args);
    return q.startsWith('UPDATE backup_drive_flow SET retry_at')?{
     ...bound,run:async()=>{if(removeRow)sql.exec('DELETE FROM backup_drive_flow');return {success:true,meta:{changes:0}}},
    }:bound;
   }};
  }}};
  await reason(await O.finishDrive(callback(start),lost),'cooldown-persistence-unconfirmed');
 }
 resetFlow();
 const unreadableState={...env,DB:{prepare(q){const s=db.prepare(q);return {...s,bind(...args){const bound=s.bind(...args);
  return q.startsWith('SELECT state_hash FROM backup_drive_flow')?{...bound,first:async()=>null}:bound;
 }}}}};
 const stateFailure=await begin(unreadableState);await reason(stateFailure,'state-persistence-unconfirmed');
 check(!stateFailure.headers.has('Location')&&!stateFailure.headers.has('Set-Cookie'),'no redirect or cookie before state readback');
 start=await begin();google();
 const unreadableToken={...env,DB:{prepare(q){const s=db.prepare(q);
  return q.startsWith('SELECT owner,revision,sealed FROM backup_drive_connection')?{...s,first:async()=>null}:s;
 }}};
 const tokenFailure=await O.finishDrive(callback(start),unreadableToken);await reason(tokenFailure,'connection-persistence-unconfirmed');
 check(!tokenFailure.headers.has('Location'),'no successful callback before token readback');
 const broken={...env,DB:{prepare(){throw Error('DB SECRET')}}};
 await reason(await O.driveStatus(req('/api/backup-drive/status'),broken),'storage-or-configuration-unavailable');
 await reason(await O.startDrive(req('/api/backup-drive/start','POST'),broken),'storage-or-configuration-unavailable');
 check(sql.prepare('SELECT COUNT(*) n FROM journal_forecasts').get().n===0&&sql.prepare('SELECT COUNT(*) n FROM journal_observations').get().n===0,'football journal untouched');
 check(sql.prepare('SELECT COUNT(*) n FROM backup_drive_flow').get().n===1&&sql.prepare('SELECT COUNT(*) n FROM backup_drive_connection').get().n===1,'bounded singleton storage');
 const source=fs.readFileSync('lib/backup-drive.server.ts','utf8');check(!/console\.|\/api\/data|captureArchive|setInterval|refresh_token'/.test(source),'no logging, data refresh, exporter or refresh loop');
 console.log(`Backup Drive OAuth: ${checks} checks passed; no live network or credentials used.`);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Date.now=realNow;sql.close()});
