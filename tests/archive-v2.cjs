const {drill}=require('../scripts/archive-drill.cjs'),A=require('../lib/archive-v2.ts'),{LEAGUES}=require('../lib/fixtures.ts');
const assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');
global.fetch=()=>{throw Error('No providers or upload allowed')};
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_tough_mathemanic.sql','utf8'));
sql.exec(fs.readFileSync('drizzle/0001_strong_black_knight.sql','utf8'));
sql.prepare('INSERT INTO backup_drive_connection VALUES (?,?,?,?)').run('primary','oauth-test-owner','oauth-test-revision','oauth-test-ciphertext');
const db={prepare:q=>q,batch:async queries=>queries.map(q=>{assert.match(q,/^(SELECT|PRAGMA)/);return {success:true,results:sql.prepare(q).all()}})};
const stamp='2026-11-06T10:00:00.000Z';
const records=new Map(A.ARCHIVE_KEYS.map((k,i)=>[k,JSON.stringify(i===0?{revision:'test',lastAttempt:stamp,leagues:Object.keys(LEAGUES).map(id=>({id}))}:{league:k.split('/')[2].replace('.json',''),runId:'test-'+i,startedAt:stamp,completedAt:stamp,stats:{lastSuccess:null},errors:['known missing']})]));
const bucket={get:async k=>records.has(k)?{size:Buffer.byteLength(records.get(k)),text:async()=>records.get(k)}:null};
const hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(s))).toString('hex');
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++};
(async()=>{
 const payload=JSON.stringify({id:'123',league:'epl',kickoff:'2026-11-06T18:00:00Z',picks:[{probability:.4}],modelVersion:'test'});
 sql.prepare('INSERT INTO journal_forecasts VALUES (?,?,?,?,?)').run('epl:123','epl','2026-11-06',stamp,payload);
 for(let i=0;i<2;i++){
  const p={id:'123',league:'epl',kind:'score',kickoff:'2026-11-06T18:00:00Z',checkedAt:`2026-11-06T20:0${i}:00Z`,homeStats:{goals:i,yellow:null},awayStats:{goals:1}};
  const {checkedAt,...facts}=p,digest=await hash(JSON.stringify(facts)),id=await hash('epl:123score'+checkedAt+digest);
  sql.prepare('INSERT INTO journal_observations VALUES (?,?,?,?,?,?,?,?,?)').run(id,'epl:123','epl','2026-11-06','score',checkedAt,checkedAt,digest,JSON.stringify(p));
 }
 const before=JSON.stringify([...records]),bundle=await A.captureArchive(db,bucket),verified=await drill(bundle);
 check(verified.recordCount===17&&verified.forecasts===1&&verified.observations===2,'all16+summary and all revisions');
 check(!JSON.stringify(bundle).includes('oauth-test'),'OAuth credentials never enter portable archive');
 check(verified.restoreDrillVerified&&!verified.offsiteVerified&&!verified.captureAtomic,'honest drill scope');
 check(bundle.body.tables.journal_forecasts[0].payload===payload,'original payload and timestamps unchanged');
 check(JSON.stringify([...records])===before&&sql.prepare('SELECT COUNT(*) n FROM journal_observations').get().n===2,'live state unchanged');
 for(const mutate of [
  b=>{b.sha256='bad'},b=>{delete b.body.records[A.ARCHIVE_KEYS[16]]},
  b=>{b.body.tables.journal_forecasts[0].committed_at='2027-01-01'},
  b=>{b.body.tables.journal_observations[0].digest='bad'},
  b=>{b.body.tables.journal_forecasts.push(b.body.tables.journal_forecasts[0])},
  b=>{b.body.tables.journal_forecasts[0].payload='null'},
  b=>{b.body.tables.journal_forecasts[0].day='2026-11-07'},
  b=>{b.body.records['arbitrary/key']='{}'},
  b=>{b.body.tables.journal_observations=[]},
  b=>{b.body.tables.journal_forecasts[0].extra='secret'},
 ]){await assert.rejects(()=>drill(structuredClone((()=>{const b=structuredClone(bundle);mutate(b);return b})())));checks++}
 const saved=records.get(A.ARCHIVE_KEYS[2]);records.delete(A.ARCHIVE_KEYS[2]);await assert.rejects(()=>A.captureArchive(db,bucket),/missing-record/);checks++;records.set(A.ARCHIVE_KEYS[2],saved);
 await assert.rejects(()=>A.captureArchive({...db,batch:async()=>{throw Error('read failed')}},bucket));checks++;
 sql.exec('CREATE TABLE journal_future (id TEXT)');await assert.rejects(()=>A.captureArchive(db,bucket),/unsupported-schema/);checks++;sql.exec('DROP TABLE journal_future');
 sql.exec('ALTER TABLE journal_forecasts ADD COLUMN future TEXT');await assert.rejects(()=>A.captureArchive(db,bucket),/unsupported-schema/);checks++;sql.exec('ALTER TABLE journal_forecasts DROP COLUMN future');
 sql.prepare('UPDATE journal_forecasts SET payload=?').run('x'.repeat(A.MAX_BYTES+1));
 let transferred=0;const guarded={...db,batch:async queries=>{const r=await db.batch(queries);transferred=r.slice(-2).reduce((n,v)=>n+v.results.length,0);return r}};
 await assert.rejects(()=>A.captureArchive(guarded,bucket),/byte-limit/);check(transferred===0,'oversized D1 payload never transferred');
 const large=structuredClone(bundle);large.body.tables.journal_forecasts=Array(A.MAX_ROWS+1).fill(large.body.tables.journal_forecasts[0]);await assert.rejects(()=>A.sealArchive(large.body),/row-limit/);checks++;
 const huge=structuredClone(bundle);huge.body.records[A.ARCHIVE_KEYS[0]]=JSON.stringify({...JSON.parse(huge.body.records[A.ARCHIVE_KEYS[0]]),padding:'x'.repeat(A.MAX_BYTES)});await assert.rejects(()=>A.sealArchive(huge.body),/byte-limit/);checks++;
 sql.close();console.log(`Archive v2: ${checks} checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
