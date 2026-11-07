// Local preparation only. Independent archive key; never the OAuth token key.
import {captureArchive,verifyArchive,type Archive,MAX_BYTES} from './archive-v2';
export const DRIVE_PLAIN_LIMIT=2*1024*1024;
export const DRIVE_WIRE_LIMIT=3*1024*1024;
const enc=new TextEncoder();
export const utf8=(s:string)=>enc.encode(s);
export async function sha256(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8(s))),x=>x.toString(16).padStart(2,'0')).join('')}
function b64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function un64(s:string,max:number){if(typeof s!=='string'||s.length>max||!s.length||!/^[\w-]+$/.test(s))throw Error('invalid-envelope');const b=Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),v=>v.charCodeAt(0));if(b64(b)!==s)throw Error('invalid-envelope');return b}
export async function archiveKey(value:string,tokenKey?:string){
 if(value===tokenKey||!/^[\w-]{43}$/.test(value||''))throw Error('archive-key-unconfigured');
 const bytes=un64(value,43);if(bytes.length!==32)throw Error('archive-key-unconfigured');
 if(tokenKey!==undefined){
  if(!/^[\w-]{43}$/.test(tokenKey))throw Error('archive-key-unconfigured');
  const tokenBytes=Uint8Array.from(atob(tokenKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  if(tokenBytes.length!==32||bytes.every((b,i)=>b===tokenBytes[i]))throw Error('archive-key-unconfigured');
 }
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
// Reject credentials even if upstream has accidentally put them into a permitted
// football payload. Preserve original JSON strings; never redact and call it exact.
export function rejectCredentials(bundle:Archive,knownSecrets:string[]=[]){
 const text=JSON.stringify(bundle);
 if(knownSecrets.some(s=>s.length>=8&&text.includes(s)))throw Error('credential-in-archive');
 const visit=(v:unknown):void=>{if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){
  const name=k.replace(/[^a-z0-9]/gi,'').toLowerCase();
  if(/^(password|passwd|secret|clientsecret|apikey|accesstoken|refreshtoken|authorization|credentials|cookie|privatekey|token)$/.test(name))throw Error('credential-in-archive');
  if(typeof x==='string'&&/(?:Bearer\s+[A-Za-z0-9._~-]{8,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/.test(x))throw Error('credential-in-archive');
  visit(x);
 }};
 for(const v of Object.values(bundle.body.records))visit(JSON.parse(v));
 for(const rows of Object.values(bundle.body.tables))for(const row of rows)visit(JSON.parse(row.payload));
}
// Two full fixed-scope reads: observe stability, never claim a transaction across
// R2 and D1. Any missing/changed data or >30 s capture fails without uploading.
export async function captureStableArchive(db:D1Database,bucket:R2Bucket){
 const deadline=Date.now()+30000;
 async function bounded<T>(read:()=>Promise<T>):Promise<T>{
  const remaining=deadline-Date.now();if(remaining<=0)throw Error('capture-window-exceeded');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('capture-window-exceeded')),remaining)})])}
  finally{clearTimeout(timer)}
 }
 // D1/R2 bindings do not expose request cancellation. A timed-out in-flight read
 // may finish at the platform, but no continuation reads or upload are allowed.
 const guardedDb={prepare:(q:string)=>db.prepare(q),batch:(queries:D1PreparedStatement[])=>bounded(()=>db.batch(queries))} as D1Database;
 const guardedBucket={get:async(key:string)=>{
  const item=await bounded(()=>bucket.get(key));
  return item?{size:item.size,text:()=>bounded(()=>item.text())}:null;
 }} as unknown as R2Bucket;
 const a=await captureArchive(guardedDb,guardedBucket);
 if(utf8(JSON.stringify(a)).length>DRIVE_PLAIN_LIMIT)throw Error('upload-size-limit');
 const b=await captureArchive(guardedDb,guardedBucket);
 if(Date.now()>deadline)throw Error('capture-window-exceeded');
 const content=(v:Archive)=>JSON.stringify([v.body.format,v.body.records,v.body.tables]);
 if(content(a)!==content(b))throw Error('capture-changed');
 if(utf8(JSON.stringify(b)).length>DRIVE_PLAIN_LIMIT)throw Error('upload-size-limit');
 rejectCredentials(b);return b;
}
type Context={folderId:string;attemptId:string};
type Envelope={format:'cardroom-encrypted-archive/1';folderId:string;attemptId:string;iv:string;ciphertext:string};
const aad=(c:Context)=>utf8(JSON.stringify(['cardroom-encrypted-archive/1',c.folderId,c.attemptId]));
export async function encryptArchive(bundle:Archive,key:CryptoKey,c:Context){
 await verifyArchive(bundle);rejectCredentials(bundle);
 const plaintext=utf8(JSON.stringify(bundle));if(plaintext.length>DRIVE_PLAIN_LIMIT)throw Error('upload-size-limit');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(c)},key,plaintext));
 const envelope:Envelope={format:'cardroom-encrypted-archive/1',...c,iv:b64(iv),ciphertext:b64(ciphertext)};
 const wire=JSON.stringify(envelope);if(utf8(wire).length>DRIVE_WIRE_LIMIT)throw Error('upload-size-limit');return wire;
}
export async function decryptArchive(wire:string,key:CryptoKey,c:Context):Promise<Archive>{
 if(utf8(wire).length>DRIVE_WIRE_LIMIT)throw Error('invalid-envelope');
 const e=JSON.parse(wire) as Envelope;
 if(!e||JSON.stringify(Object.keys(e).sort())!==JSON.stringify(['format','folderId','attemptId','iv','ciphertext'].sort())||
  e.format!=='cardroom-encrypted-archive/1'||e.folderId!==c.folderId||e.attemptId!==c.attemptId)throw Error('invalid-envelope');
 const iv=un64(e.iv,16);if(iv.length!==12)throw Error('invalid-envelope');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(c)},key,un64(e.ciphertext,DRIVE_WIRE_LIMIT));
 if(plain.byteLength>Math.min(MAX_BYTES,DRIVE_PLAIN_LIMIT))throw Error('upload-size-limit');
 const bundle=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain)) as Archive;
 await verifyArchive(bundle);rejectCredentials(bundle);return bundle;
}
