// Manual owner-only HTTP boundary. No UI, schedule, provider calls on GET,
// enrollment or configuration changes. Disabled unless all existing gates pass.
import {SITE_ORIGIN} from './backup-drive.server';
import {runDriveBackup,type UploadEnv} from './backup-drive-upload.server';
const PATH='/api/backup-drive/upload',BODY_LIMIT=128,BODY_TIMEOUT=2000;
const HEADERS={'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store',
 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
 'X-Robots-Tag':'noindex, nofollow','Vary':'Cookie, oai-authenticated-user-id',
 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
function response(body:unknown,status:number,extra:Record<string,string>={}){return Response.json(body,{status,headers:{...HEADERS,...extra}})}
function failure(reason:string,status:number,extra:Record<string,string>={}){return response({status:'error',reason,offsiteVerified:false,restoreDrillVerified:false},status,extra)}
class BodyError extends Error{constructor(readonly reason:string,readonly status:number){super(reason)}}
async function readAction(req:Request){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers.get('Content-Type')||''))throw new BodyError('json-required',415);
 const length=req.headers.get('Content-Length');
 if(length!==null&&(!/^\d{1,3}$/.test(length)||Number(length)>BODY_LIMIT))throw new BodyError('body-too-large',413);
 if(!req.body)throw new BodyError('explicit-action-required',400);
 const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0,count=0,timer:ReturnType<typeof setTimeout>|undefined;
 const expired=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new BodyError('body-timeout',408)),BODY_TIMEOUT)});
 try{
  for(;;){
   if(++count>BODY_LIMIT)throw new BodyError('body-too-large',413);
   const {done,value}=await Promise.race([reader.read(),expired]);if(done)break;
   size+=value.length;if(size>BODY_LIMIT)throw new BodyError('body-too-large',413);chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new BodyError('explicit-action-required',400)}
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||
   (value as {action?:unknown}).action!=='create-one-backup')throw new BodyError('explicit-action-required',400);
 }finally{clearTimeout(timer);void reader.cancel().catch(()=>{})}
}
const ERROR_REASONS=new Set(['upload-binding-changed', 'cooldown', 'upload-in-progress', 'invalid-upload-state', 'upload-claim-unconfirmed', 'upload-persistence-unconfirmed', 'backup-deadline', 'reauthorization-required', 'google-access-denied', 'google-rate-limited', 'remote-file-unconfirmed', 'google-request-failed', 'google-response-too-large', 'google-invalid-response', 'refresh-grant-invalid', 'google-account-mismatch', 'private-folder-required', 'remote-metadata-mismatch', 'remote-content-mismatch', 'upload-disabled', 'nonatomic-approval-required', 'upload-unconfigured', 'google-invalid-file-id', 'connection-changed', 'upload-outcome-unconfirmed', 'cooldown-persistence-unconfirmed', 'disabled', 'unconfigured', 'owner-required', 'wrong-origin', 'method-not-allowed', 'not-connected', 'archive-key-unconfigured', 'capture-changed', 'capture-window-exceeded', 'upload-size-limit', 'credential-in-archive', 'missing-record', 'unsupported-schema', 'byte-limit', 'row-limit', 'backup-validation-or-storage-failed']);
function errorStatus(reason:string){
 if(['owner-required','wrong-origin'].includes(reason))return 403;
 if(['cooldown','google-rate-limited'].includes(reason))return 429;
 if(['not-connected','reauthorization-required','nonatomic-approval-required','upload-in-progress','upload-binding-changed','invalid-upload-state','connection-changed','capture-changed'].includes(reason))return 409;
 if(['upload-disabled','disabled','unconfigured','upload-unconfigured','archive-key-unconfigured','backup-validation-or-storage-failed','upload-persistence-unconfirmed','upload-claim-unconfirmed','cooldown-persistence-unconfirmed'].includes(reason))return 503;
 return 502;
}
export async function driveUploadRoute(req:Request,env:UploadEnv):Promise<Response>{
 try{
  if(req.method!=='POST')return failure('method-not-allowed',405,{Allow:'POST'});
  const url=new URL(req.url);
  if(url.origin!==SITE_ORIGIN||url.pathname!==PATH||url.search)return failure('invalid-request-target',400);
  const owner=env.CARDROOM_BACKUP_OWNER_ID,id=req.headers.get('oai-authenticated-user-id');
  if(!id)return failure('owner-required',401);
  if(id.length>256)return failure('owner-required',403);
  if(!owner||owner.length>256)return failure('owner-unconfigured',503);
  if(id!==owner)return failure('owner-required',403);
  if(req.headers.get('Origin')!==SITE_ORIGIN||!['same-origin',null].includes(req.headers.get('Sec-Fetch-Site')))return failure('wrong-origin',403);
  // Identity/origin checks happen before body, storage and all provider activity.
  await readAction(req);
  const report=await runDriveBackup(req,env) as Record<string,unknown>;
  if(report.status==='error'){
   const reason=typeof report.reason==='string'&&ERROR_REASONS.has(report.reason)?report.reason:'backup-validation-or-storage-failed';
   const parsed=typeof report.retryAt==='string'?Date.parse(report.retryAt):NaN;
   const retryAt=Number.isFinite(parsed)?new Date(parsed).toISOString():null;
   const status=errorStatus(reason),extra:Record<string,string>={};
   if(status===429&&Number.isFinite(parsed)&&parsed>Date.now())extra['Retry-After']=String(Math.min(2147483647,Math.ceil((parsed-Date.now())/1000)));
   return response({status:'error',reason,retryAt,offsiteVerified:false,restoreDrillVerified:false},status,extra);
  }
  if(!['uploaded-verified','already-uploaded'].includes(String(report.status))||report.uploadVerified!==true||
   report.captureAtomic!==false||report.offsiteVerified!==false||report.restoreDrillVerified!==false||report.backupEnabled!==false||
   typeof report.attemptId!=='string'||!/^[a-f0-9-]{36}$/.test(report.attemptId)||
   typeof report.fileId!=='string'||!/^[A-Za-z0-9_-]{10,200}$/.test(report.fileId)||
   typeof report.completedAt!=='string'||!Number.isFinite(Date.parse(report.completedAt)))return failure('backup-result-unconfirmed',503);
  // Projection: never forward arbitrary provider fields, payloads or credentials.
  return response({status:report.status,uploadVerified:true,captureAtomic:false,stability:'two-pass-observed',
   offsiteVerified:false,restoreDrillVerified:false,backupEnabled:false,
   attemptId:report.attemptId,fileId:report.fileId,completedAt:new Date(report.completedAt).toISOString()},report.status==='uploaded-verified'?201:200);
 }catch(e){return e instanceof BodyError?failure(e.reason,e.status):failure('backup-validation-or-storage-failed',503)}
}
