// Server-only provider authorization, NOT a replacement for Sites sign-in.
// No archive capture, Drive file writes, refresh loop or scheduling in this module.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const SITE_ORIGIN = 'https://cardroom-europe.lush-flute-9375.chatgpt.site';
export const CALLBACK_PATH = '/api/backup-drive/callback';
export const CALLBACK_URI = SITE_ORIGIN + CALLBACK_PATH;
const COOKIE = '__Host-cardroom-drive';
const TTL = 10 * 60_000;
const DAY = 86_400_000;
const enc = new TextEncoder();

export type DriveEnv = {
 DB?: D1Database;
 CARDROOM_DRIVE_ENABLED?: string;
 CARDROOM_BACKUP_OWNER_ID?: string;
 CARDROOM_DRIVE_CLIENT_ID?: string;
 CARDROOM_DRIVE_CLIENT_SECRET?: string;
 CARDROOM_DRIVE_TOKEN_KEY?: string;
 CARDROOM_DRIVE_ACCOUNT_EMAIL?: string;
 CARDROOM_DRIVE_OAUTH_MODE?: string;
};
type Config = {db:D1Database;owner:string;clientId:string;secret:string;key:CryptoKey;email:string;mode:'testing'|'production'};
type Flow = {state_hash:string;browser_hash:string;sealed:string;expires_at:number;retry_at:number;last_error:string|null};
type Connection = {owner:string;revision:string;sealed:string};
type StoredToken = {version:1;refreshToken:string;permissionId:string;email:string;scope:string;connectedAt:number;expiresAt:number|null;mode:'testing'|'production'};
class SafeError extends Error {
 status:number; retryAt:number|null;
 constructor(code:string,status=400,retryAt:number|null=null){super(code);this.status=status;this.retryAt=retryAt}
}
function fail(code:string,status=400):never {throw new SafeError(code,status)}
function b64(value:Uint8Array){return btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function un64(value:string){
 if(!/^[\w-]+$/.test(value)||value.length>24000)fail('invalid-sealed-data',503);
 const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function random(){return b64(crypto.getRandomValues(new Uint8Array(32)))}
async function hash(value:string){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))))}
function nonempty(value:unknown,max=4096):value is string{return typeof value==='string'&&value.length>0&&value.length<=max}
async function config(env:DriveEnv):Promise<Config>{
 if(env.CARDROOM_DRIVE_ENABLED!=='true')fail('disabled',503);
 if(!env.DB||!nonempty(env.CARDROOM_BACKUP_OWNER_ID,256)||
  !/^[\w-]+\.apps\.googleusercontent\.com$/.test(env.CARDROOM_DRIVE_CLIENT_ID||'')||
  !nonempty(env.CARDROOM_DRIVE_CLIENT_SECRET)||!nonempty(env.CARDROOM_DRIVE_ACCOUNT_EMAIL,254)||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.CARDROOM_DRIVE_ACCOUNT_EMAIL)||
  !['testing','production'].includes(env.CARDROOM_DRIVE_OAUTH_MODE||''))fail('unconfigured',503);
 if(!/^[\w-]{43}$/.test(env.CARDROOM_DRIVE_TOKEN_KEY||''))fail('unconfigured',503);
 const key=un64(env.CARDROOM_DRIVE_TOKEN_KEY!);
 if(key.byteLength!==32)fail('unconfigured',503);
 return {db:env.DB,owner:env.CARDROOM_BACKUP_OWNER_ID,clientId:env.CARDROOM_DRIVE_CLIENT_ID!,
  secret:env.CARDROOM_DRIVE_CLIENT_SECRET,key:await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt','decrypt']),
  email:env.CARDROOM_DRIVE_ACCOUNT_EMAIL.toLowerCase(),mode:env.CARDROOM_DRIVE_OAUTH_MODE as Config['mode']};
}
function owner(req:Request,c:Config){
 // These are platform-trusted headers in hosted Sites, NOT user-supplied auth on a standalone server.
 if(req.headers.get('oai-authenticated-user-id')!==c.owner)fail('owner-required',403);
 if(new URL(req.url).origin!==SITE_ORIGIN)fail('wrong-origin',403);
}
function aad(c:Config,kind:string){return enc.encode(JSON.stringify(['cardroom-drive/1',SITE_ORIGIN,c.clientId,c.owner,c.email,kind]))}
async function seal(c:Config,value:unknown,kind:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(c,kind)},c.key,enc.encode(JSON.stringify(value)));
 return `1.${b64(iv)}.${b64(new Uint8Array(ciphertext))}`;
}
async function unseal<T>(c:Config,value:string,kind:string):Promise<T>{
 if(!nonempty(value,24000))fail('invalid-sealed-data',503);
 const parts=value.split('.');if(parts.length!==3||parts[0]!=='1')fail('invalid-sealed-data',503);
 try{
  const iv=un64(parts[1]);if(iv.byteLength!==12)fail('invalid-sealed-data',503);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(c,kind)},c.key,un64(parts[2]));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
 }catch{fail('invalid-sealed-data',503)}
}
const headers = {'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
function reply(body:unknown,status=200,extra:Record<string,string>={}){return Response.json(body,{status,headers:{...headers,...extra}})}
function errorReply(e:unknown){
 const safe=e instanceof SafeError?e:new SafeError('storage-or-configuration-unavailable',503);
 return reply({status:'error',reason:safe.message,retryAt:safe.retryAt?new Date(safe.retryAt).toISOString():null,offsiteVerified:false},safe.status);
}
function cookie(value:string,age:number){return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`}
function browserCookie(req:Request){
 const matches=(req.headers.get('Cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE+'='));
 if(matches.length!==1)fail('invalid-session');
 const v=matches[0].slice(COOKIE.length+1);if(!/^[\w-]{43}$/.test(v))fail('invalid-session');return v;
}
async function readConnection(c:Config){
 return c.db.prepare("SELECT owner,revision,sealed FROM backup_drive_connection WHERE id='primary'").first<Connection>();
}
async function tokenRecord(c:Config,row:Connection):Promise<StoredToken>{
 if(row.owner!==c.owner)fail('connection-owner-mismatch',503);
 const t=await unseal<StoredToken>(c,row.sealed,'token');
 if(t?.version!==1||!nonempty(t.refreshToken)||!nonempty(t.permissionId,256)||t.email!==c.email||t.scope!==DRIVE_SCOPE||
  !Number.isSafeInteger(t.connectedAt)||t.connectedAt<=0||!['testing','production'].includes(t.mode)||
  !(t.expiresAt===null||(Number.isSafeInteger(t.expiresAt)&&t.expiresAt>t.connectedAt))||
  (t.mode==='testing'&&(t.expiresAt===null||t.expiresAt>t.connectedAt+7*DAY)))fail('invalid-sealed-data',503);
 return t;
}

// Explicit same-origin owner POST only. One pending flow per Site; a new start invalidates the previous one.
export async function startDrive(req:Request,env:DriveEnv):Promise<Response>{
 try{
  if(req.method!=='POST')return reply({status:'error',reason:'method-not-allowed'},405,{Allow:'POST'});
  const c=await config(env);owner(req,c);
  if(req.headers.get('Origin')!==SITE_ORIGIN||!['same-origin',null].includes(req.headers.get('Sec-Fetch-Site')))fail('wrong-origin',403);
  if(new URL(req.url).search)fail('unexpected-query');
  const now=Date.now(),state=random(),browser=random(),verifier=random(),stateHash=await hash(state),browserHash=await hash(browser);
  const sealed=await seal(c,{verifier},'flow:'+stateHash);
  const row=await c.db.prepare(`INSERT INTO backup_drive_flow
   (id,owner,state_hash,browser_hash,sealed,started_at,expires_at,consumed_at,retry_at,last_error)
   VALUES ('primary',?,?,?,?,?,?,NULL,0,NULL)
   ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,state_hash=excluded.state_hash,browser_hash=excluded.browser_hash,
   sealed=excluded.sealed,started_at=excluded.started_at,expires_at=excluded.expires_at,consumed_at=NULL,last_error=NULL
   WHERE backup_drive_flow.owner=excluded.owner AND backup_drive_flow.retry_at<=? AND backup_drive_flow.started_at<=?
   RETURNING state_hash`).bind(c.owner,stateHash,browserHash,sealed,now,now+TTL,now,now-60_000).first<{state_hash:string}>();
  if(!row){
   const previous=await c.db.prepare("SELECT owner,retry_at,started_at FROM backup_drive_flow WHERE id='primary'").first<{owner:string;retry_at:number;started_at:number}>();
   if(previous?.owner!==c.owner)fail('flow-owner-mismatch',503);
   throw new SafeError('cooldown',429,Math.max(previous.retry_at,previous.started_at+60_000));
  }
  const verified=await c.db.prepare("SELECT state_hash FROM backup_drive_flow WHERE id='primary' AND owner=?").bind(c.owner).first<{state_hash:string}>();
  if(verified?.state_hash!==stateHash)fail('state-persistence-unconfirmed',503);
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:c.clientId,redirect_uri:CALLBACK_URI,response_type:'code',scope:DRIVE_SCOPE,
   access_type:'offline',prompt:'consent select_account',include_granted_scopes:'false',state,
   code_challenge:await hash(verifier),code_challenge_method:'S256'}).toString();
  return new Response(null,{status:303,headers:{...headers,Location:url.href,'Set-Cookie':cookie(browser,TTL/1000)}});
 }catch(e){return errorReply(e)}
}

// Finite diagnostic labels only. Never inspect message, stack, cause or provider data.
function transportCategory(error:unknown,deadline:boolean){
 if(deadline)return 'deadline';
 try{
  const name=error&&typeof error==='object'?(error as {name?:unknown}).name:null;
  switch(name){
   case 'TypeError':return 'type-error';
   case 'AbortError':return 'abort-error';
   case 'TimeoutError':return 'timeout-error';
   case 'Error':return 'error';
  }
 }catch{/* A hostile/unknown name getter is not diagnostic data. */}
 return 'unknown';
}

// Fixed two-host transport. No redirect following, raw exception output, arbitrary URL or retry loop.
async function googleJson(url:string,init:RequestInit,stage:'token'|'account'):Promise<Record<string,unknown>>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20_000);
 let phase:'fetch'|'response'|'body'='fetch';
 try{
  // Workers supports manual, not error. Never follow or inspect a redirect target.
  const response=await fetch(url,{...init,redirect:'manual',signal:controller.signal,cache:'no-store'});
  phase='response';
  if(response.status>=300&&response.status<400)throw new SafeError(`google-${stage}-redirect-refused`,502,Date.now()+5*60_000);
  if(!response.ok){
   const now=Date.now(),retry=response.headers.get('Retry-After');
   let retryAt=now+(response.status===403?60*60_000:5*60_000);
   if(retry){const parsed=/^\d+$/.test(retry)?now+Number(retry)*1000:Date.parse(retry);if(Number.isFinite(parsed))retryAt=Math.max(retryAt,Math.min(parsed,8640000000000000))}
   throw new SafeError(`google-${stage}-http-${response.status}`,502,retryAt);
  }
  if(Number(response.headers.get('Content-Length'))>32768)fail('google-response-too-large',502);
  phase='body';
  const reader=response.body?.getReader();if(!reader)fail('google-invalid-response',502);
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768)fail('google-response-too-large',502);chunks.push(value)}}
  finally{await reader.cancel().catch(()=>{})}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  let data:unknown;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{fail('google-invalid-response',502)}
  if(!data||typeof data!=='object'||Array.isArray(data))fail('google-invalid-response',502);
  return data as Record<string,unknown>;
 }catch(e){
  if(e instanceof SafeError)throw e;
  throw new SafeError(`google-${stage}-${phase}-${transportCategory(e,controller.signal.aborted)}`,502,Date.now()+5*60_000);
 }
 finally{clearTimeout(timer)}
}

// OAuth's browser callback is a GET, but only a previously owner-initiated, cookie-bound,
// atomically consumed state can exchange a code or store a connection.
export async function finishDrive(req:Request,env:DriveEnv):Promise<Response>{
 let c:Config|undefined;
 try{
  if(req.method!=='GET')return reply({status:'error',reason:'method-not-allowed'},405,{Allow:'GET'});
  c=await config(env);owner(req,c);
  const query=new URL(req.url).searchParams,state=query.get('state'),code=query.get('code'),denied=query.get('error');
  if(req.url.length>12000||query.getAll('state').length!==1||!state||!/^[\w-]{43}$/.test(state)||
   query.getAll('code').length>1||query.getAll('error').length>1||(!code&&!denied)||(code&&denied)||
   (code&&!nonempty(code,8192)))fail('invalid-callback');
  const stateHash=await hash(state),browserHash=await hash(browserCookie(req)),now=Date.now();
  const flow=await c.db.prepare(`UPDATE backup_drive_flow SET consumed_at=? WHERE id='primary' AND owner=?
   AND state_hash=? AND browser_hash=? AND consumed_at IS NULL AND expires_at>? AND retry_at<=?
   RETURNING state_hash,browser_hash,sealed,expires_at,retry_at,last_error`)
   .bind(now,c.owner,stateHash,browserHash,now,now).first<Flow>();
  if(!flow)fail('expired-or-used-state');
  if(denied)fail('consent-not-granted');
  const pending=await unseal<{verifier:string}>(c,flow.sealed,'flow:'+stateHash);
  if(!pending||!/^[\w-]{43}$/.test(pending.verifier))fail('invalid-sealed-data',503);
  const result=await googleJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({client_id:c.clientId,client_secret:c.secret,code:code!,code_verifier:pending.verifier,
    grant_type:'authorization_code',redirect_uri:CALLBACK_URI})},'token');
  if(result.token_type!=='Bearer'||result.scope!==DRIVE_SCOPE||!nonempty(result.access_token)||!nonempty(result.refresh_token))fail('offline-grant-incomplete',502);
  const account=await googleJson('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)',{
   method:'GET',headers:{Authorization:'Bearer '+result.access_token}},'account');
  const user=account.user as {emailAddress?:unknown;permissionId?:unknown}|undefined;
  if(!nonempty(user?.emailAddress,254)||user.emailAddress.toLowerCase()!==c.email||!nonempty(user.permissionId,256))fail('google-account-mismatch',403);
  let expiresAt:number|null=c.mode==='testing'?now+7*DAY:null;
  if(result.refresh_token_expires_in!==undefined){
   const seconds=result.refresh_token_expires_in;
   if(typeof seconds!=='number'||!Number.isSafeInteger(seconds)||seconds<=0||seconds>3650*86400)fail('invalid-token-expiry',502);
   expiresAt=Math.min(expiresAt??Infinity,now+seconds*1000);
  }
  const token:StoredToken={version:1,refreshToken:result.refresh_token,permissionId:user.permissionId,email:c.email,
   scope:DRIVE_SCOPE,connectedAt:now,expiresAt,mode:c.mode};
  const revision=random(),sealed=await seal(c,token,'token');
  // A slower, superseded callback must not overwrite a newer owner's flow/connection.
  const saved=await c.db.prepare(`INSERT INTO backup_drive_connection (id,owner,revision,sealed)
   SELECT 'primary',?,?,? WHERE EXISTS(SELECT 1 FROM backup_drive_flow WHERE id='primary' AND owner=? AND state_hash=? AND consumed_at=? AND expires_at>?)
   ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,revision=excluded.revision,sealed=excluded.sealed
   WHERE backup_drive_connection.owner=excluded.owner RETURNING revision`)
   .bind(c.owner,revision,sealed,c.owner,stateHash,now,Date.now()).first<{revision:string}>();
  if(saved?.revision!==revision)fail('connection-superseded',409);
  const readback=await readConnection(c);
  if(readback?.revision!==revision)fail('connection-persistence-unconfirmed',503);
  const decoded=await tokenRecord(c,readback);
  if(decoded.refreshToken!==token.refreshToken)fail('connection-persistence-unconfirmed',503);
  // Remove the code from the address bar; never return a token or the provider payload.
  // Do not clear the shared cookie here: a delayed response could erase a newer
  // flow's cookie. One-use state blocks replay; the browser cookie expires by TTL.
  return new Response(null,{status:303,headers:{...headers,Location:SITE_ORIGIN+'/api/backup-drive/status'}});
 }catch(e){
  if(c&&e instanceof SafeError&&e.retryAt){
   try{
    await c.db.prepare("UPDATE backup_drive_flow SET retry_at=MAX(retry_at,?),last_error=? WHERE id='primary' AND owner=?")
     .bind(e.retryAt,e.message,c.owner).run();
    const saved=await c.db.prepare("SELECT retry_at FROM backup_drive_flow WHERE id='primary' AND owner=?")
     .bind(c.owner).first<{retry_at:number}>();
    if(!saved||saved.retry_at<e.retryAt)fail('cooldown-persistence-unconfirmed',503);
   }catch{return errorReply(new SafeError('cooldown-persistence-unconfirmed',503))}
  }
  return errorReply(e);
 }
}

// Owner-only local status. Reading it makes no Google request and performs no writes.
export async function driveStatus(req:Request,env:DriveEnv):Promise<Response>{
 try{
  if(req.method!=='GET')return reply({status:'error',reason:'method-not-allowed'},405,{Allow:'GET'});
  const c=await config(env);owner(req,c);if(new URL(req.url).search)fail('unexpected-query');
  const row=await readConnection(c),flow=await c.db.prepare("SELECT retry_at,last_error FROM backup_drive_flow WHERE id='primary' AND owner=?")
   .bind(c.owner).first<{retry_at:number;last_error:string|null}>();
  const token=row?await tokenRecord(c,row):null,now=Date.now();
  return reply({status:token?(token.expiresAt!==null&&token.expiresAt<=now?'reauthorization-required':'credential-stored'):'not-connected',
   persisted:!!token,connectedAt:token?new Date(token.connectedAt).toISOString():null,
   reauthorizeBy:token?.expiresAt?new Date(token.expiresAt).toISOString():null,oauthMode:token?.mode??c.mode,
   retryAt:flow&&flow.retry_at>now?new Date(flow.retry_at).toISOString():null,
   providerAccessVerifiedNow:false,folderAccessVerified:false,offsiteVerified:false,backupEnabled:false});
 }catch(e){return errorReply(e)}
}
