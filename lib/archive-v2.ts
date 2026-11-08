import {observationDigestFacts} from './observation-digest';
// Preparation only: no route, schedule, production writer or external uploader.
import {LEAGUES} from './fixtures';
export const ARCHIVE_KEYS=['cardroom/data-v1.json',...Object.keys(LEAGUES).map(l=>`referee-updates/v1/${l}.json`)];
export const TABLES={
 journal_forecasts:['match_key','league','day','committed_at','payload'],
 journal_observations:['id','match_key','league','day','kind','observed_at','checked_at','digest','payload'],
} as const;
export const MAX_ROWS=10000,MAX_BYTES=16*1024*1024;
type Row=Record<string,string>;
type Table=keyof typeof TABLES;
export type ArchiveBody={format:'cardroom-archive/2';sourceVersion:107;startedAt:string;completedAt:string;captureAtomic:false;leagues:string[];records:Record<string,string>;tables:Record<Table,Row[]>};
export type Archive={body:ArchiveBody;sha256:string};
const bytes=(v:string)=>new TextEncoder().encode(v);
async function hash(v:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(v))),x=>x.toString(16).padStart(2,'0')).join('')}
const same=(a:string[],b:string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const validTime=(s:unknown)=>typeof s==='string'&&Number.isFinite(Date.parse(s));
function validate(body:ArchiveBody){
 if(!body||body.format!=='cardroom-archive/2'||body.sourceVersion!==107||body.captureAtomic!==false||!validTime(body.startedAt)||!validTime(body.completedAt)||Date.parse(body.startedAt)>Date.parse(body.completedAt))throw Error('invalid-manifest');
 if(!Array.isArray(body.leagues)||!same(body.leagues,Object.keys(LEAGUES))||!body.records||!same(Object.keys(body.records),ARCHIVE_KEYS)||!body.tables||!same(Object.keys(body.tables),Object.keys(TABLES)))throw Error('incomplete-scope');
 for(const key of ARCHIVE_KEYS){
  if(typeof body.records[key]!=='string')throw Error('invalid-record');
  const value=JSON.parse(body.records[key]);
  if(key===ARCHIVE_KEYS[0]){if(!value?.revision||!validTime(value.lastAttempt)||!Array.isArray(value.leagues)||!same(value.leagues.map((l:any)=>l.id),body.leagues))throw Error('invalid-summary')}
  else if(value?.league!==key.split('/')[2].replace('.json','')||!value.runId||!validTime(value.startedAt)||!validTime(value.completedAt)||Date.parse(value.startedAt)>Date.parse(value.completedAt))throw Error('invalid-report');
 }
 for(const table of Object.keys(TABLES) as Table[]){
  const rows=body.tables[table],seen=new Set<string>();
  if(!Array.isArray(rows)||rows.length>MAX_ROWS)throw Error('row-limit');
  for(const row of rows){
   if(!row||!same(Object.keys(row),[...TABLES[table]])||Object.values(row).some(v=>typeof v!=='string'))throw Error('invalid-row');
   const id=row[TABLES[table][0]];
   if(!id||seen.has(id))throw Error('duplicate-row');seen.add(id);
   const p=JSON.parse(row.payload);
   if(!p||p.league!==row.league||`${p.league}:${p.id}`!==row.match_key||!body.leagues.includes(row.league)||!validTime(p.kickoff))throw Error('invalid-identity');
   const day=new Date(Date.parse(p.kickoff)+4*3600000).toISOString().slice(0,10);
   if(day!==row.day)throw Error('invalid-day');
   if(table==='journal_forecasts'){
    if(!validTime(row.committed_at)||Date.parse(row.committed_at)>=Date.parse(p.kickoff)||!Array.isArray(p.picks))throw Error('invalid-forecast');
   }else if(!validTime(row.observed_at)||!validTime(row.checked_at)||p.checkedAt!==row.checked_at||p.kind!==row.kind||!['score','analysis'].includes(row.kind))throw Error('invalid-observation');
  }
 }
}
export async function sealArchive(body:ArchiveBody):Promise<Archive>{
 validate(body);const text=JSON.stringify(body);if(bytes(text).length>MAX_BYTES)throw Error('byte-limit');
 // Also validate the journal's original semantic digests, not only the container.
 for(const r of body.tables.journal_observations){const payload=JSON.parse(r.payload),checkedAt=payload.checkedAt;if(await hash(JSON.stringify(observationDigestFacts(payload)))!==r.digest||await hash(r.match_key+r.kind+checkedAt+r.digest)!==r.id)throw Error('observation-digest')}
 return {body,sha256:await hash(text)};
}
export async function verifyArchive(bundle:Archive){
 const checked=await sealArchive(bundle?.body);
 if(checked.sha256!==bundle.sha256)throw Error('archive-digest');
 return {status:'verified' as const,recordCount:ARCHIVE_KEYS.length,forecasts:bundle.body.tables.journal_forecasts.length,observations:bundle.body.tables.journal_observations.length,captureAtomic:false,offsiteVerified:false};
}
// Fixed SELECTs only. One D1 batch; R2 reads are sequential and NOT cross-store atomic.
// Reject unknown journal tables/columns instead of silently claiming full coverage.
export async function captureArchive(db:D1Database,bucket:R2Bucket):Promise<Archive>{
 const startedAt=new Date().toISOString(),records:Record<string,string>={};let size=0;
 for(const key of ARCHIVE_KEYS){const item=await bucket.get(key);if(!item)throw Error('missing-record');size+=item.size;if(size>MAX_BYTES)throw Error('byte-limit');records[key]=await item.text()}
 const budget=MAX_BYTES-size;
 const totalBytes=Object.entries(TABLES).map(([t,cols])=>`COALESCE((SELECT SUM(${cols.map(c=>`length(CAST(${c} AS BLOB))`).join('+')}) FROM ${t}),0)`).join('+');
 const result=await db.batch([
  db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND substr(name,1,8)='journal_' ORDER BY name"),
  ...Object.keys(TABLES).map(t=>db.prepare(`PRAGMA table_info(${t})`)),
  db.prepare(`SELECT ${totalBytes} AS bytes`),
  ...Object.entries(TABLES).map(([t,cols])=>db.prepare(`SELECT ${cols.join(',')} FROM ${t} WHERE (${totalBytes})<=${budget} ORDER BY ${cols[0]} LIMIT ${MAX_ROWS+1}`)),
 ]);
 if(result.some(r=>!r.success)||!same(result[0].results.map((r:any)=>r.name),Object.keys(TABLES)))throw Error('unsupported-schema');
 const names=Object.keys(TABLES) as Table[];
 for(let i=0;i<names.length;i++)if(!same(result[i+1].results.map((r:any)=>r.name),[...TABLES[names[i]]]))throw Error('unsupported-schema');
 if(Number((result[1+names.length].results[0] as any)?.bytes)>budget)throw Error('byte-limit');
 const tables=Object.fromEntries(names.map((t,i)=>[t,result[2+names.length+i].results])) as Record<Table,Row[]>;
 return sealArchive({format:'cardroom-archive/2',sourceVersion:107,startedAt,completedAt:new Date().toISOString(),captureAtomic:false,leagues:Object.keys(LEAGUES),records,tables});
}
