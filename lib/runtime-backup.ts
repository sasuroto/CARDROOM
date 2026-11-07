import {LEAGUES} from './fixtures';

const DAY=86400000,OFFSET=4*3600000;
export const BACKUP_SLOTS=7,MAX_BACKUP_BYTES=4*1024*1024;
// Preserve the v105 backup contract and already verified copies. Additional
// competitions require a separately versioned backup migration, not relabelling
// or overwriting the existing 12-record archive.
const leagues=['epl','ucl','uel','uecl','laliga','segunda','seriea','bundesliga','ligue1','superlig','primeira'];
export const BACKUP_RECORD_KEYS=['cardroom/data-v1.json',...leagues.map(id=>`referee-updates/v1/${id}.json`)];
export function backupLocation(now:number){
 const day=new Date(now+OFFSET).toISOString().slice(0,10),slot=((Math.floor((now+OFFSET)/DAY)%BACKUP_SLOTS)+BACKUP_SLOTS)%BACKUP_SLOTS;
 return {day,slot,key:`recovery/v1/daily/slot-${slot}.json`,drillKey:`recovery/v1/drill/slot-${slot}.json`};
}
const plain=(v:any)=>!!v&&typeof v==='object'&&!Array.isArray(v);
const time=(v:any,now:number)=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=now;
function validRecords(records:any,now:number){
 if(!plain(records)||Object.keys(records).length!==BACKUP_RECORD_KEYS.length||!BACKUP_RECORD_KEYS.every(k=>Object.hasOwn(records,k)))return false;
 const summary=records[BACKUP_RECORD_KEYS[0]];
 if(!plain(summary)||typeof summary.revision!=='string'||!summary.revision||!time(summary.lastAttempt,now)||!Array.isArray(summary.leagues)||!leagues.every(id=>summary.leagues.filter((l:any)=>l?.id===id).length===1))return false;
 return leagues.every(id=>{const r=records[`referee-updates/v1/${id}.json`];return plain(r)&&r.league===id&&typeof r.runId==='string'&&r.runId.length>0&&time(r.startedAt,now)&&time(r.completedAt,now)&&Date.parse(r.completedAt)>=Date.parse(r.startedAt)});
}
async function digest(records:any){
 const bytes=new TextEncoder().encode(JSON.stringify(records));
 if(bytes.byteLength>MAX_BACKUP_BYTES)throw Error('oversized');
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
async function read(bucket:R2Bucket,key:string){
 const item=await bucket.get(key);
 if(!item)return null;
 if(item.size>MAX_BACKUP_BYTES+4096)throw Error('oversized');
 return {etag:item.etag,value:await item.json<any>()};
}
async function validBundle(b:any,now:number){
 if(!plain(b)||b.schemaVersion!==1||!time(b.createdAt,now)||b.day!==backupLocation(Date.parse(b.createdAt)).day||!validRecords(b.records,now))return false;
 return typeof b.sha256==='string'&&b.sha256===await digest(b.records);
}
const result=(status:string,day:string,detail:Record<string,unknown>={})=>({status,day,retentionSlots:BACKUP_SLOTS,scope:'Summary and 11 referee reports only',...detail});
const metadata=(b:any)=>({createdAt:b.createdAt,sha256:b.sha256,recordCount:BACKUP_RECORD_KEYS.length,summaryRevision:b.records[BACKUP_RECORD_KEYS[0]].revision,captureAtomic:false});

// Restore only to a fixed isolated namespace, never to any live key. No public restore endpoint.
async function isolatedDrill(bucket:R2Bucket,bundle:any,now:number){
 if(!await validBundle(bundle,now))return false;
 const {drillKey}=backupLocation(Date.parse(bundle.createdAt)),old=await read(bucket,drillKey);
 if(old?.value?.day>bundle.day)return false;
 if(old&&old.value?.sha256===bundle.sha256&&old.value.day===bundle.day&&await validBundle(old.value,now))return true;
 const onlyIf=old?{etagMatches:old.etag}:new Headers({'If-None-Match':'*'});
 const written=await bucket.put(drillKey,JSON.stringify(bundle),{onlyIf,httpMetadata:{contentType:'application/json'}});
 // On contention, only the exact winning backup can satisfy this drill.
 const restored=await read(bucket,drillKey);
 return written!==null&&!!restored&&restored.value.day===bundle.day&&restored.value.sha256===bundle.sha256&&await validBundle(restored.value,now);
}

export async function inspectDailyBackup(bucket:R2Bucket|undefined,now=Date.now()){
 const location=backupLocation(now);
 if(!bucket)return result('unconfigured',location.day);
 try{
  const backup=await read(bucket,location.key);
  if(!backup)return result('missing',location.day);
  if(!await validBundle(backup.value,now))return result('invalid',location.day);
  if(backup.value.day!==location.day)return result('not-created-today',location.day,{lastSlotDate:backup.value.day});
  const drill=await read(bucket,location.drillKey);
  const verified=!!drill&&drill.value.day===location.day&&drill.value.sha256===backup.value.sha256&&await validBundle(drill.value,now);
  return result(verified?'verified':'drill-unverified',location.day,{...metadata(backup.value),restoreDrillVerified:verified});
 }catch{return result('unavailable',location.day)}
}

const running=new WeakMap<R2Bucket,Promise<ReturnType<typeof result>>>();
export async function ensureDailyBackup(bucket:R2Bucket|undefined,now=Date.now()){
 if(!bucket)return result('unconfigured',backupLocation(now).day);
 const active=running.get(bucket);if(active)return active;
 const work=checkpoint(bucket,now);running.set(bucket,work);
 try{return await work}finally{running.delete(bucket)}
}
async function checkpoint(bucket:R2Bucket,now:number){
 const location=backupLocation(now);
 try{
  const previous=await read(bucket,location.key);
  // Never silently replace corrupt or future-dated history. Inspect it separately.
  if(previous&&(!await validBundle(previous.value,now)||previous.value.day>location.day))return result('invalid',location.day);
  let bundle=previous?.value;
  if(!bundle||bundle.day!==location.day){
   const records:Record<string,any>={};let bytes=0;
   for(const key of BACKUP_RECORD_KEYS){
    const entry=await read(bucket,key);if(!entry)return result('incomplete',location.day);
    bytes+=new TextEncoder().encode(JSON.stringify(entry.value)).byteLength;
    if(bytes>MAX_BACKUP_BYTES)return result('too-large',location.day);
    records[key]=entry.value;
   }
   if(!validRecords(records,now))return result('incomplete',location.day);
   bundle={schemaVersion:1,day:location.day,createdAt:new Date(now).toISOString(),sha256:await digest(records),records};
   const onlyIf=previous?{etagMatches:previous.etag}:new Headers({'If-None-Match':'*'});
   await bucket.put(location.key,JSON.stringify(bundle),{onlyIf,httpMetadata:{contentType:'application/json'}});
   // Read the winner, even if a concurrent request won the conditional write.
   const saved=await read(bucket,location.key);
   if(!saved||saved.value.day!==location.day||!await validBundle(saved.value,now))return result('write-unverified',location.day);
   bundle=saved.value;
  }
  const verified=await isolatedDrill(bucket,bundle,now);
  return result(verified?'verified':'drill-unverified',location.day,{...metadata(bundle),restoreDrillVerified:verified});
 }catch{return result('unavailable',location.day)}
}
