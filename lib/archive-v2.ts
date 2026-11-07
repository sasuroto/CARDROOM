// Preparation only: no route, schedule, production writer or external uploader.
import {LEAGUES} from './fixtures';
export const ARCHIVE_KEYS=['cardroom/data-v1.json',...Object.keys(LEAGUES).map(l=>`referee-updates/v1/${l}.json`)];
export const TABLES={
 journal_forecasts:['match_key','league','day','committed_at','payload'],
 journal_observations:['id','match_key','league','day','kind','observed_at','checked_at','digest','payload'],
} as const;
export const MAX_ROWS=10000,MAX_BYTES=16*1024*1024;
type Row=Record<string,string>;
export const TABLES_V3={...TABLES,journal_exact11:['match_key','league','day','committed_at','payload']} as const;
type Table=keyof typeof TABLES_V3;
type Manifest={startedAt:string;completedAt:string;captureAtomic:false;leagues:string[];records:Record<string,string>};
export type ArchiveBody=Manifest & (
 {format:'cardroom-archive/2';sourceVersion:107;tables:Record<keyof typeof TABLES,Row[]>} |
 {format:'cardroom-archive/3';sourceVersion:'0002_exact_score_11';tables:Record<Table,Row[]>}
);
export function archiveTables(body:ArchiveBody){return body.format==='cardroom-archive/3'?TABLES_V3:TABLES}
export type Archive={body:ArchiveBody;sha256:string};
const bytes=(v:string)=>new TextEncoder().encode(v);
async function hash(v:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(v))),x=>x.toString(16).padStart(2,'0')).join('')}
const same=(a:string[],b:string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const validTime=(s:unknown)=>typeof s==='string'&&Number.isFinite(Date.parse(s));
function validate(body:ArchiveBody){
 if(!body||!((body.format==='cardroom-archive/2'&&body.sourceVersion===107)||(body.format==='cardroom-archive/3'&&body.sourceVersion==='0002_exact_score_11'))||body.captureAtomic!==false||!validTime(body.startedAt)||!validTime(body.completedAt)||Date.parse(body.startedAt)>Date.parse(body.completedAt))throw Error('invalid-manifest');
 if(!same(Object.keys(body),['format','sourceVersion','startedAt','completedAt','captureAtomic','leagues','records','tables']))throw Error('invalid-manifest');
 const schema=archiveTables(body);
 if(!Array.isArray(body.leagues)||!same(body.leagues,Object.keys(LEAGUES))||!body.records||!same(Object.keys(body.records),ARCHIVE_KEYS)||!body.tables||!same(Object.keys(body.tables),Object.keys(schema)))throw Error('incomplete-scope');
 for(const key of ARCHIVE_KEYS){
  if(typeof body.records[key]!=='string')throw Error('invalid-record');
  const value=JSON.parse(body.records[key]);
  if(key===ARCHIVE_KEYS[0]){if(!value?.revision||!validTime(value.lastAttempt)||!Array.isArray(value.leagues)||!same(value.leagues.map((l:any)=>l.id),body.leagues))throw Error('invalid-summary')}
  else if(value?.league!==key.split('/')[2].replace('.json','')||!value.runId||!validTime(value.startedAt)||!validTime(value.completedAt)||Date.parse(value.startedAt)>Date.parse(value.completedAt))throw Error('invalid-report');
 }
 for(const table of Object.keys(schema) as Table[]){
  const rows=(body.tables as Record<Table,Row[]>)[table],seen=new Set<string>();
  if(!Array.isArray(rows)||rows.length>MAX_ROWS)throw Error('row-limit');
  for(const row of rows){
   if(!row||!same(Object.keys(row),[...TABLES_V3[table]])||Object.values(row).some(v=>typeof v!=='string'))throw Error('invalid-row');
   const id=row[TABLES_V3[table][0]];
   if(!id||seen.has(id))throw Error('duplicate-row');seen.add(id);
   const p=JSON.parse(row.payload);
   if(!p||p.league!==row.league||`${p.league}:${p.id}`!==row.match_key||!body.leagues.includes(row.league)||!validTime(p.kickoff))throw Error('invalid-identity');
   const day=new Date(Date.parse(p.kickoff)+4*3600000).toISOString().slice(0,10);
   if(day!==row.day)throw Error('invalid-day');
   if(table==='journal_forecasts'){
    if(!validTime(row.committed_at)||Date.parse(row.committed_at)>=Date.parse(p.kickoff)||!Array.isArray(p.picks))throw Error('invalid-forecast');
   }else if(table==='journal_exact11'){
    if(!validTime(row.committed_at)||Date.parse(row.committed_at)>=Date.parse(p.kickoff)||!validTime(p.computedAt)||Date.parse(p.computedAt)>Date.parse(row.committed_at)||p.experiment!=='cardroom-11/1'||p.status!=='ok'||![p.poisson?.probability,p.dc?.probability].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<1))throw Error('invalid-exact-forecast');
   }else if(!validTime(row.observed_at)||!validTime(row.checked_at)||p.checkedAt!==row.checked_at||p.kind!==row.kind||!['score','analysis'].includes(row.kind))throw Error('invalid-observation');
  }
 }
}
export async function sealArchive(body:ArchiveBody):Promise<Archive>{
 validate(body);const text=JSON.stringify(body);if(bytes(text).length>MAX_BYTES)throw Error('byte-limit');
 // Also validate the journal's original semantic digests, not only the container.
 for(const r of body.tables.journal_observations){const {checkedAt,...facts}=JSON.parse(r.payload);if(await hash(JSON.stringify(facts))!==r.digest||await hash(r.match_key+r.kind+checkedAt+r.digest)!==r.id)throw Error('observation-digest')}
 return {body,sha256:await hash(text)};
}
export async function verifyArchive(bundle:Archive){
 const checked=await sealArchive(bundle?.body);
 if(checked.sha256!==bundle.sha256)throw Error('archive-digest');
 return {status:'verified' as const,recordCount:ARCHIVE_KEYS.length,forecasts:bundle.body.tables.journal_forecasts.length,observations:bundle.body.tables.journal_observations.length,...(bundle.body.format==='cardroom-archive/3'?{exactForecasts:bundle.body.tables.journal_exact11.length}:{}),captureAtomic:false,offsiteVerified:false};
}
// Fixed reads only. Discovery followed by one data batch; R2 is NOT cross-store atomic.
// Reject unknown journal tables/columns instead of silently claiming full coverage.
export async function captureArchive(db:D1Database,bucket:R2Bucket):Promise<Archive>{
 const startedAt=new Date().toISOString(),records:Record<string,string>={};let size=0;
 for(const key of ARCHIVE_KEYS){const item=await bucket.get(key);if(!item)throw Error('missing-record');size+=item.size;if(size>MAX_BYTES)throw Error('byte-limit');records[key]=await item.text()}
 // Discover only table names; never SELECT credential rows. Recheck journal scope in
 // the data batch so a concurrent additive migration cannot be silently omitted.
 const list="SELECT name FROM sqlite_master WHERE type='table' AND lower(substr(name,1,8))='journal_' ORDER BY name";
 const discovery=await db.batch([db.prepare(list)]);
 if(!discovery[0]?.success)throw Error('unsupported-schema');
 const found=discovery[0].results.map((r:any)=>r.name);
 const schema=same(found,Object.keys(TABLES_V3))?TABLES_V3:same(found,Object.keys(TABLES))?TABLES:null;
 if(!schema)throw Error('unsupported-schema');
 const budget=MAX_BYTES-size;
 const totalBytes=Object.entries(schema).map(([t,cols])=>`COALESCE((SELECT SUM(${cols.map(c=>`length(CAST(${c} AS BLOB))`).join('+')}) FROM ${t}),0)`).join('+');
 const result=await db.batch([
  db.prepare(list),
  ...Object.keys(schema).map(t=>db.prepare(`PRAGMA table_xinfo(${t})`)),
  db.prepare(`SELECT ${totalBytes} AS bytes`),
  ...Object.entries(schema).map(([t,cols])=>db.prepare(`SELECT ${cols.join(',')} FROM ${t} WHERE (${totalBytes})<=${budget} ORDER BY ${cols[0]} LIMIT ${MAX_ROWS+1}`)),
 ]);
 if(result.some(r=>!r.success)||!same(result[0].results.map((r:any)=>r.name),Object.keys(schema)))throw Error('unsupported-schema');
 const names=Object.keys(schema) as Table[];
 for(let i=0;i<names.length;i++){
  const columns=TABLES_V3[names[i]],actual=result[i+1].results as any[];
  if(!same(actual.map(r=>r.name),[...columns])||actual.some(r=>String(r.type).toUpperCase()!=='TEXT'||r.notnull!==1||r.pk!==(r.name===columns[0]?1:0)||r.dflt_value!==null||r.hidden!==0))throw Error('unsupported-schema');
 }
 if(Number((result[1+names.length].results[0] as any)?.bytes)>budget)throw Error('byte-limit');
 const tables=Object.fromEntries(names.map((t,i)=>[t,result[2+names.length+i].results])) as Record<Table,Row[]>;
 const manifest={startedAt,completedAt:new Date().toISOString(),captureAtomic:false as const,leagues:Object.keys(LEAGUES),records,tables};
 return sealArchive(schema===TABLES_V3?{...manifest,format:'cardroom-archive/3',sourceVersion:'0002_exact_score_11'}:{...manifest,format:'cardroom-archive/2',sourceVersion:107});
}
