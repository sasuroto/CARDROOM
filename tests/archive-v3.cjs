// Real SQLite, synthetic records only. Never providers, live D1, R2 or OAuth.
const {drill}=require('../scripts/archive-drill.cjs'),A=require('../lib/archive-v2.ts'),{LEAGUES}=require('../lib/fixtures.ts');
const assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');
global.fetch=()=>{throw Error('Network forbidden')};
const sql=new DatabaseSync(':memory:');
sql.exec(fs.readFileSync('drizzle/0000_tough_mathemanic.sql','utf8'));
const queries=[];
const db={prepare:q=>q,batch:async qs=>qs.map(q=>{
 assert.match(q,/^(SELECT|PRAGMA)/);assert.doesNotMatch(q,/backup_drive/);queries.push(q);
 return {success:true,results:sql.prepare(q).all()};
})};
const stamp='2026-11-06T10:00:00.000Z';
const records=new Map(A.ARCHIVE_KEYS.map((k,i)=>[k,JSON.stringify(i===0?{revision:'synthetic',lastAttempt:stamp,leagues:Object.keys(LEAGUES).map(id=>({id}))}:{league:k.split('/')[2].replace('.json',''),runId:'synthetic-'+i,startedAt:stamp,completedAt:stamp})]));
const bucket={get:async k=>({size:Buffer.byteLength(records.get(k)),text:async()=>records.get(k)})};
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++};
const rejects=async(fn,re)=>{await assert.rejects(fn,re);checks++};
const changed=(bundle,fn)=>{const b=structuredClone(bundle);fn(b);return b};
(async()=>{
 const original=await A.captureArchive(db,bucket);
 check(original.body.format==='cardroom-archive/2'&&(await drill(original)).forecasts===0,'migration 0000 alone and empty legacy archive restore');
 sql.exec(fs.readFileSync('drizzle/0001_strong_black_knight.sql','utf8'));
 sql.prepare('INSERT INTO backup_drive_connection VALUES (?,?,?,?)').run('primary','synthetic-secret-owner','synthetic-secret-revision','synthetic-secret-ciphertext');
 sql.prepare('INSERT INTO backup_drive_flow VALUES (?,?,?,?,?,?,?,?,?,?)').run('flow','synthetic-secret-owner','synthetic-secret-state','synthetic-secret-browser','synthetic-secret-ciphertext',1,2,null,0,null);
 const old=await A.captureArchive(db,bucket);
 check(old.body.format==='cardroom-archive/2'&&old.body.sourceVersion===107,'old schema still produces original v2 contract');
 check((await drill(old)).restoreDrillVerified,'old v2 archives still restore');
 sql.exec(fs.readFileSync('drizzle/0002_exact_score_11.sql','utf8'));
 const empty=await A.captureArchive(db,bucket);
 check(empty.body.format==='cardroom-archive/3'&&(await drill(empty)).exactForecasts===0,'empty exact table still requires v3');
 const legacyPayload=JSON.stringify({id:'123456',league:'epl',kickoff:'2026-11-06T18:00:00Z',picks:[{probability:.4}],modelVersion:'test'});
 sql.prepare('INSERT INTO journal_forecasts VALUES (?,?,?,?,?)').run('epl:123456','epl','2026-11-06',stamp,legacyPayload);
 const hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(s))).toString('hex');
 for(let i=0;i<2;i++){
  const p={id:'123456',league:'epl',kind:'score',kickoff:'2026-11-06T18:00:00Z',checkedAt:`2026-11-06T20:0${i}:00Z`,homeStats:{goals:i,yellow:null},awayStats:{goals:1}};
  const {checkedAt,...facts}=p,digest=await hash(JSON.stringify(facts)),id=await hash('epl:123456score'+checkedAt+digest);
  sql.prepare('INSERT INTO journal_observations VALUES (?,?,?,?,?,?,?,?,?)').run(id,'epl:123456','epl','2026-11-06','score',checkedAt,checkedAt,digest,JSON.stringify(p));
 }
 const payload=JSON.stringify({id:'123456',league:'epl',kickoff:'2026-11-06T18:00:00Z',computedAt:stamp,experiment:'cardroom-11/1',status:'ok',poisson:{probability:.12,version:'poisson-league-mle/1'},dc:{probability:.13,version:'dixon-coles-joint-mle/1'},missing:null,sourceDate:'2026-11-05',sampleSize:101});
 sql.prepare('INSERT INTO journal_exact11 VALUES (?,?,?,?,?)').run('epl:123456','epl','2026-11-06',stamp,payload);
 const before=JSON.stringify(sql.prepare('SELECT * FROM journal_exact11').all()),bundle=await A.captureArchive(db,bucket),result=await drill(bundle);
 check(result.forecasts===1&&result.observations===2&&bundle.body.tables.journal_forecasts[0].payload===legacyPayload,'all three populated tables and observation revisions coexist in v3');
 await rejects(()=>A.sealArchive(changed(bundle,b=>{b.body.tables.journal_observations[0].digest='bad'}).body),/observation-digest/);
 check(bundle.body.sourceVersion==='0002_exact_score_11','v3 identifies migration, not a fictitious Sites release');
 check(bundle.body.tables.journal_exact11[0].payload===payload,'exact payload preserved byte-for-byte with nulls and provenance');
 check(result.exactForecasts===1&&result.recordCount===17&&result.restoreDrillVerified&&!result.offsiteVerified&&!result.productionRestore&&!result.captureAtomic,'honest full-scope isolated roundtrip');
 check(before===JSON.stringify(sql.prepare('SELECT * FROM journal_exact11').all()),'capture leaves source unchanged');
 check(!JSON.stringify(bundle).includes('synthetic-secret')&&queries.every(q=>!q.includes('backup_drive')),'both credential tables excluded from all reads and archive');
 check((await drill(old)).restoreDrillVerified,'v2 read remains compatible after exact migration');
 await rejects(()=>drill(changed(bundle,b=>{b.body.tables.journal_exact11[0].payload=payload.replace('.12','.14')})),/archive-digest/);
 for(const mutate of [
  b=>{delete b.body.tables.journal_exact11},
  b=>{b.body.format='cardroom-archive/2';b.body.sourceVersion=107},
  b=>{b.body.sourceVersion=109},b=>{b.body.format='cardroom-archive/4'},
  b=>{b.body.tables.journal_future=[]},b=>{b.body.tables.backup_drive_connection=[]},
  b=>{b.body.credentials='unexpected'},
  b=>{b.body.tables.journal_exact11[0].day='2026-11-07'},
  b=>{b.body.tables.journal_exact11[0].committed_at='2026-11-06T18:00:00Z'},
  b=>{b.body.tables.journal_exact11.push(b.body.tables.journal_exact11[0])},
  ...[
   p=>{p.computedAt='2026-11-06T11:00:00Z'},p=>{p.computedAt=null},
   p=>{p.experiment='future/2'},p=>{p.status='unavailable'},
   p=>{p.poisson.probability=null},p=>{p.dc.probability=1},p=>{p.dc.probability=-1},
   p=>{p.league='ita'},p=>{p.id='other'},
  ].map(fn=>b=>{const r=b.body.tables.journal_exact11[0],p=JSON.parse(r.payload);fn(p);r.payload=JSON.stringify(p)}),
 ])await rejects(()=>A.sealArchive(changed(bundle,mutate).body));
 sql.exec('CREATE TABLE JOURNAL_UPPER (id TEXT)');await rejects(()=>A.captureArchive(db,bucket),/unsupported-schema/);sql.exec('DROP TABLE JOURNAL_UPPER');
 sql.exec('CREATE TABLE journal_future (id TEXT)');await rejects(()=>A.captureArchive(db,bucket),/unsupported-schema/);sql.exec('DROP TABLE journal_future');
 sql.exec('ALTER TABLE journal_exact11 ADD COLUMN generated_payload TEXT GENERATED ALWAYS AS (payload) VIRTUAL');await rejects(()=>A.captureArchive(db,bucket),/unsupported-schema/);sql.exec('ALTER TABLE journal_exact11 DROP COLUMN generated_payload');
 sql.exec('ALTER TABLE journal_exact11 ADD COLUMN extra TEXT');await rejects(()=>A.captureArchive(db,bucket),/unsupported-schema/);sql.exec('ALTER TABLE journal_exact11 DROP COLUMN extra');
 // Types/constraints are checked even on empty tables, not only column names.
 sql.exec('ALTER TABLE journal_exact11 RENAME TO temporary_exact11; CREATE TABLE journal_exact11 (match_key TEXT PRIMARY KEY NOT NULL,league TEXT NOT NULL,day TEXT NOT NULL,committed_at TEXT NOT NULL,payload INTEGER NOT NULL)');
 await rejects(()=>A.captureArchive(db,bucket),/unsupported-schema/);
 sql.exec('DROP TABLE journal_exact11; ALTER TABLE temporary_exact11 RENAME TO journal_exact11');
 let calls=0;
 const race={...db,batch:async qs=>{if(++calls===2)sql.exec('CREATE TABLE journal_future (id TEXT)');return db.batch(qs)}};
 await rejects(()=>A.captureArchive(race,bucket),/unsupported-schema/);sql.exec('DROP TABLE journal_future');
 sql.prepare('UPDATE journal_exact11 SET payload=?').run('x'.repeat(A.MAX_BYTES+1));
 let transferred=0;
 const guarded={...db,batch:async qs=>{const r=await db.batch(qs);for(let i=0;i<qs.length;i++)if(/^SELECT match_key,|^SELECT id,/.test(qs[i]))transferred+=r[i].results.length;return r}};
 await rejects(()=>A.captureArchive(guarded,bucket),/byte-limit/);check(transferred===0,'oversized exact payload not transferred');
 await rejects(()=>A.sealArchive(changed(bundle,b=>{b.body.tables.journal_exact11=Array(A.MAX_ROWS+1).fill(b.body.tables.journal_exact11[0])}).body),/row-limit/);
 sql.close();console.log(`Archive v3: ${checks} checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
