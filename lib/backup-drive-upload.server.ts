// PREPARATION ONLY: no route imports this module, no cron or production writes run.
// Explicit owner action, fixed Drive hosts/folder, one bounded attempt, no deletion.
import {authorizeDriveBackup,DRIVE_SCOPE,type DriveEnv} from './backup-drive.server';
import {archiveKey,captureStableArchive,encryptArchive,decryptArchive,rejectCredentials,sha256,utf8,DRIVE_WIRE_LIMIT} from './backup-drive-archive.server';
export type UploadEnv=DriveEnv & {BUCKET?:R2Bucket;CARDROOM_DRIVE_UPLOAD_ENABLED?:string;
 CARDROOM_DRIVE_FOLDER_ID?:string;CARDROOM_ARCHIVE_KEY?:string;CARDROOM_ALLOW_NONATOMIC_BACKUP?:string};
type State={owner:string;binding:string;run_key:string;attempt_id:string;file_id:string|null;phase:string;
 lease_until:number;archive_sha256:string|null;wire_sha256:string|null;wire_size:number|null;
 started_at:number;updated_at:number;retry_at:number;last_error:string|null};
type Auth=Awaited<ReturnType<typeof authorizeDriveBackup>>;
const ID=/^[A-Za-z0-9_-]{10,200}$/;
const LEASE=180000,RUN_LIMIT=120000;
class BackupError extends Error{constructor(readonly code:string,readonly retryAt=Date.now()+300000){super(code)}}
function stop(code:string):never{throw new BackupError(code)}
const read=(db:D1Database)=>db.prepare("SELECT * FROM backup_drive_upload WHERE id='primary'").first<State>();
function result(state:State,status='uploaded-verified'){
 return {status,uploadVerified:state.phase==='verified',captureAtomic:false,stability:'two-pass-observed',
  restoreDrillVerified:false,offsiteVerified:false,backupEnabled:false,
  attemptId:state.attempt_id,fileId:state.file_id,completedAt:state.phase==='verified'?new Date(state.updated_at).toISOString():null};
}
async function claim(a:Auth,binding:string):Promise<{state:State;cached:boolean;reconcile:boolean}>{
 const old=await read(a.db),now=Date.now(),runKey=new Date(now).toISOString().slice(0,10);
 if(old&&(old.owner!==a.owner||old.binding!==binding))stop('upload-binding-changed');
 if(old?.phase==='verified'&&old.run_key===runKey)return {state:old,cached:true,reconcile:false};
 if(old&&old.retry_at>now)throw new BackupError('cooldown',old.retry_at);
 if(old&&old.lease_until>now)stop('upload-in-progress');
 const reconcile=!!old&&['uploading','uncertain'].includes(old.phase);
 if(reconcile&&(!old.file_id||!old.archive_sha256||!old.wire_sha256||!old.wire_size))stop('invalid-upload-state');
 if(old&&!['verified','failed','preparing','uploading','uncertain'].includes(old.phase))stop('invalid-upload-state');
 const attempt=reconcile?old!.attempt_id:crypto.randomUUID(),lease=now+LEASE;
 let saved:State|null;
 if(reconcile){
  saved=await a.db.prepare(`UPDATE backup_drive_upload SET lease_until=?,updated_at=?
   WHERE id='primary' AND owner=? AND binding=? AND attempt_id=? AND lease_until<=? AND retry_at<=?
   RETURNING *`).bind(lease,now,a.owner,binding,attempt,now,now).first<State>();
 }else{
  saved=await a.db.prepare(`INSERT INTO backup_drive_upload
   (id,owner,binding,run_key,attempt_id,phase,lease_until,started_at,updated_at,retry_at)
   VALUES ('primary',?,?,?,?, 'preparing',?,?,?,0)
   ON CONFLICT(id) DO UPDATE SET run_key=excluded.run_key,attempt_id=excluded.attempt_id,phase='preparing',
   file_id=NULL,archive_sha256=NULL,wire_sha256=NULL,wire_size=NULL,lease_until=excluded.lease_until,
   started_at=excluded.started_at,updated_at=excluded.updated_at,retry_at=0,last_error=NULL
   WHERE backup_drive_upload.owner=excluded.owner AND backup_drive_upload.binding=excluded.binding
   AND backup_drive_upload.lease_until<=? AND backup_drive_upload.retry_at<=?
   AND (backup_drive_upload.phase IN ('failed','preparing') OR
    (backup_drive_upload.phase='verified' AND backup_drive_upload.run_key<>excluded.run_key)) RETURNING *`)
   .bind(a.owner,binding,runKey,attempt,lease,now,now,now,now).first<State>();
 }
 const back=await read(a.db);
 if(!saved||back?.attempt_id!==attempt||back.lease_until!==lease)stop('upload-claim-unconfirmed');
 return {state:back,cached:false,reconcile};
}
async function save(a:Auth,s:State,phase:string,extra:{file?:string;archive?:string;wire?:string;size?:number;retry?:number;error?:string}={}){
 const now=Date.now(),lease=phase==='uploading'?s.lease_until:0;
 const out=await a.db.prepare(`UPDATE backup_drive_upload SET phase=?,file_id=?,archive_sha256=?,wire_sha256=?,wire_size=?,
  updated_at=?,lease_until=?,retry_at=?,last_error=? WHERE id='primary' AND owner=? AND binding=? AND attempt_id=? AND lease_until=? RETURNING *`)
  .bind(phase,extra.file??s.file_id,extra.archive??s.archive_sha256,extra.wire??s.wire_sha256,extra.size??s.wire_size,
   now,lease,extra.retry??0,extra.error??null,a.owner,s.binding,s.attempt_id,s.lease_until).first<State>();
 const back=await read(a.db);
 if(!out||back?.attempt_id!==s.attempt_id||back.phase!==phase||back.updated_at!==now||back.wire_sha256!==out.wire_sha256||back.lease_until!==lease)stop('upload-persistence-unconfirmed');
 return back;
}
async function google(url:string,init:RequestInit,deadline:number,max=32768,beforeFetch?:()=>void):Promise<string>{
 const left=deadline-Date.now();if(left<=0)stop('backup-deadline');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(20000,left));
 try{
  beforeFetch?.();
  const r=await fetch(url,{...init,redirect:'error',signal:controller.signal,cache:'no-store'});
  if(!r.ok){
   let retry=Date.now()+(r.status===403?3600000:300000);const header=r.headers.get('Retry-After');
   if(header){const t=/^\d+$/.test(header)?Date.now()+Number(header)*1000:Date.parse(header);if(Number.isFinite(t))retry=Math.max(retry,Math.min(t,8640000000000000))}
   throw new BackupError(r.status===401?'reauthorization-required':r.status===403?'google-access-denied':r.status===429?'google-rate-limited':r.status===404?'remote-file-unconfirmed':'google-request-failed',retry);
  }
  if(Number(r.headers.get('Content-Length'))>max)stop('google-response-too-large');
  const reader=r.body?.getReader();if(!reader)stop('google-invalid-response');
  let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader!.read();if(done)break;size+=value.length;if(size>max)stop('google-response-too-large');chunks.push(value)}}
  finally{await reader!.cancel().catch(()=>{})}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }catch(e){if(e instanceof BackupError)throw e;throw new BackupError('google-request-failed')}
 finally{clearTimeout(timer)}
}
async function json(url:string,init:RequestInit,deadline:number,beforeFetch?:()=>void){
 const text=await google(url,init,deadline,32768,beforeFetch);try{const v=JSON.parse(text);if(!v||typeof v!=='object'||Array.isArray(v))stop('google-invalid-response');return v as Record<string,unknown>}
 catch(e){if(e instanceof BackupError)throw e;throw new BackupError('google-invalid-response')}
}
const validString=(s:unknown,max=4096):s is string=>typeof s==='string'&&s.length>0&&s.length<=max;
async function access(a:Auth,deadline:number){
 const t=await json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({client_id:a.clientId,client_secret:a.clientSecret,refresh_token:a.refreshToken,grant_type:'refresh_token'})},deadline);
 if(t.token_type!=='Bearer'||t.scope!==DRIVE_SCOPE||!validString(t.access_token)||typeof t.expires_in!=='number'||t.expires_in<180||t.expires_in>86400||
  (t.refresh_token!==undefined&&t.refresh_token!==a.refreshToken))stop('refresh-grant-invalid');
 const headers={Authorization:'Bearer '+t.access_token};
 const account=await json('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)',{headers},deadline);
 const u=account.user as {emailAddress?:unknown;permissionId?:unknown}|undefined;
 if(typeof u?.emailAddress!=='string'||u.emailAddress.toLowerCase()!==a.email||u.permissionId!==a.permissionId)stop('google-account-mismatch');
 return headers;
}
async function folder(folderId:string,headers:Record<string,string>,deadline:number){
 const f=await json(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,mimeType,trashed,capabilities(canAddChildren),ownedByMe,shared`,{headers},deadline);
 const c=f.capabilities as {canAddChildren?:unknown}|undefined;
 if(f.id!==folderId||f.mimeType!=='application/vnd.google-apps.folder'||f.trashed!==false||f.ownedByMe!==true||f.shared!==false||c?.canAddChildren!==true)stop('private-folder-required');
}
async function verifyRemote(s:State,folderId:string,key:CryptoKey,headers:Record<string,string>,deadline:number){
 if(!s.file_id||!ID.test(s.file_id))stop('invalid-upload-state');
 const url=`https://www.googleapis.com/drive/v3/files/${s.file_id}`;
 const f=await json(url+'?fields=id,name,mimeType,size,parents,trashed,ownedByMe,shared,appProperties',{headers},deadline);
 const p=f.appProperties as Record<string,unknown>|undefined;
 if(f.id!==s.file_id||f.name!==`cardroom-${s.run_key}-${s.attempt_id}.enc.json`||f.mimeType!=='application/octet-stream'||f.trashed!==false||
  f.ownedByMe!==true||f.shared!==false||!Array.isArray(f.parents)||f.parents.length!==1||f.parents[0]!==folderId||Number(f.size)!==s.wire_size||
  p?.cardroomAttempt!==s.attempt_id||p?.wireSha256!==s.wire_sha256)stop('remote-metadata-mismatch');
 const wire=await google(url+'?alt=media',{headers},deadline,DRIVE_WIRE_LIMIT);
 if(utf8(wire).length!==s.wire_size||await sha256(wire)!==s.wire_sha256)stop('remote-content-mismatch');
 const bundle=await decryptArchive(wire,key,{folderId,attemptId:s.attempt_id});
 if(bundle.sha256!==s.archive_sha256)stop('remote-content-mismatch');
}
// Intended for a future reviewed owner-only route. No route or maintenance path
// currently calls it. No arbitrary URL/file ID/body can influence the destination.
export async function runDriveBackup(req:Request,env:UploadEnv){
 let a:Auth|undefined,s:State|undefined,intentConfirmed=false,createDispatched=false;
 try{
  if(env.CARDROOM_DRIVE_UPLOAD_ENABLED!=='true')stop('upload-disabled');
  if(env.CARDROOM_ALLOW_NONATOMIC_BACKUP!=='true')stop('nonatomic-approval-required');
  if(!env.BUCKET||!ID.test(env.CARDROOM_DRIVE_FOLDER_ID||''))stop('upload-unconfigured');
  const folderId=env.CARDROOM_DRIVE_FOLDER_ID!,key=await archiveKey(env.CARDROOM_ARCHIVE_KEY!,env.CARDROOM_DRIVE_TOKEN_KEY);
  a=await authorizeDriveBackup(req,env);
  const binding=await sha256(JSON.stringify([a.owner,a.clientId,a.email,a.permissionId,folderId,await sha256(env.CARDROOM_ARCHIVE_KEY!)]));
  const claimed=await claim(a,binding);s=claimed.state;if(claimed.cached)return result(s,'already-uploaded');
  const deadline=Date.now()+RUN_LIMIT,headers=await access(a,deadline);
  await folder(folderId,headers,deadline);
  if(!claimed.reconcile){
   const bundle=await captureStableArchive(a.db,env.BUCKET!);
   rejectCredentials(bundle,[a.clientSecret,a.refreshToken,env.CARDROOM_DRIVE_TOKEN_KEY!,env.CARDROOM_ARCHIVE_KEY!]);
   const wire=await encryptArchive(bundle,key,{folderId,attemptId:s.attempt_id});
   const ids=await json('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files',{headers},deadline);
   if(!Array.isArray(ids.ids)||ids.ids.length!==1||typeof ids.ids[0]!=='string'||!ID.test(ids.ids[0]))stop('google-invalid-file-id');
   // Persist the preallocated ID and checksums BEFORE the only create request.
   // An unknown outcome only permits readback of this same ID, never another create.
   const current=await a.db.prepare("SELECT revision FROM backup_drive_connection WHERE id='primary' AND owner=?").bind(a.owner).first<{revision:string}>();
   if(current?.revision!==a.connectionRevision)stop('connection-changed');
   s={...s,phase:'uploading',file_id:ids.ids[0],archive_sha256:bundle.sha256,wire_sha256:await sha256(wire),wire_size:utf8(wire).length};
   s=await save(a,s,'uploading');intentConfirmed=true;
   const boundary='cardroom_'+crypto.randomUUID(),metadata={id:s.file_id,name:`cardroom-${s.run_key}-${s.attempt_id}.enc.json`,
    mimeType:'application/octet-stream',parents:[folderId],appProperties:{cardroomAttempt:s.attempt_id,wireSha256:s.wire_sha256}};
   const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${wire}\r\n--${boundary}--\r\n`;
   const created=await json('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{
    method:'POST',headers:{...headers,'Content-Type':'multipart/related; boundary='+boundary},body},deadline,()=>{createDispatched=true});
   if(created.id!==s.file_id)stop('upload-outcome-unconfirmed');
  }
  await verifyRemote(s,folderId,key,headers,deadline);
  s=await save(a,s,'verified');return result(s);
 }catch(e){
  const allowed=['disabled','unconfigured','owner-required','wrong-origin','method-not-allowed','not-connected','reauthorization-required','cooldown','archive-key-unconfigured',
   'capture-changed','capture-window-exceeded','upload-size-limit','credential-in-archive','missing-record','unsupported-schema','byte-limit','row-limit'];
  const error=e instanceof BackupError?e:new BackupError(e instanceof Error&&allowed.includes(e.message)?e.message:'backup-validation-or-storage-failed');
  if(a&&s){
   try{
    // Share provider backoff with OAuth starts; no token or provider body is logged.
    const cooldown=await a.db.prepare("UPDATE backup_drive_flow SET retry_at=MAX(retry_at,?),last_error=? WHERE id='primary' AND owner=? RETURNING retry_at")
     .bind(error.retryAt,error.code,a.owner).first<{retry_at:number}>();
    const checked=await a.db.prepare("SELECT retry_at FROM backup_drive_flow WHERE id='primary' AND owner=?").bind(a.owner).first<{retry_at:number}>();
    if(!cooldown||!checked||checked.retry_at<error.retryAt)stop('cooldown-persistence-unconfirmed');
    // Only a confirmed intent AND no create dispatch proves a safe pre-send failure.
    // Unknown intent persistence or any attempted fetch remains uncertain.
    const uncertain=s.phase==='uncertain'||(s.phase==='uploading'&&(!intentConfirmed||createDispatched));
    s=await save(a,s,uncertain?'uncertain':'failed',{retry:error.retryAt,error:error.code});
   }catch{return {status:'error',reason:'upload-persistence-unconfirmed',offsiteVerified:false,restoreDrillVerified:false}}
  }
  return {status:'error',reason:error.code,retryAt:new Date(error.retryAt).toISOString(),offsiteVerified:false,restoreDrillVerified:false};
 }
}
