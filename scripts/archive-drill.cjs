// Offline-only restoration rehearsal. A database path cannot be supplied.
const fs=require('node:fs'),ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const A=require('../lib/archive-v2.ts');
async function drill(bundle){
 const metadata=await A.verifyArchive(bundle),db=new DatabaseSync(':memory:');
 try{
  db.exec(fs.readFileSync(require('node:path').join(__dirname,'../drizzle/0000_tough_mathemanic.sql'),'utf8'));
  if(bundle.body.format==='cardroom-archive/3')db.exec(fs.readFileSync(require('node:path').join(__dirname,'../drizzle/0002_exact_score_11.sql'),'utf8'));
  const schema=A.archiveTables(bundle.body);
  db.exec('BEGIN');
  for(const [table,cols] of Object.entries(schema)){
   const insert=db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`);
   for(const row of bundle.body.tables[table])insert.run(...cols.map(c=>row[c]));
  }
  db.exec('COMMIT');
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('sqlite-integrity');
  const tables=Object.fromEntries(Object.entries(schema).map(([t,c])=>[t,db.prepare(`SELECT ${c.join(',')} FROM ${t} ORDER BY ${c[0]}`).all().map(r=>({...r}))]));
  const records=JSON.parse(JSON.stringify(bundle.body.records));
  const roundtrip=await A.sealArchive({...bundle.body,tables,records});
  if(roundtrip.sha256!==bundle.sha256)throw Error('restore-mismatch');
  return {...metadata,restoreDrillVerified:true,drillTarget:'in-memory SQLite and JSON',productionRestore:false};
 }finally{db.close()}
}
module.exports={drill};
if(require.main===module){
 if(process.argv.length!==2){console.error('Accepts archive JSON on stdin only; no database path.');process.exit(1)}
 let input='',size=0;process.stdin.setEncoding('utf8');
 process.stdin.on('data',s=>{size+=Buffer.byteLength(s);if(size>A.MAX_BYTES+4096){console.error('Archive too large');process.exit(1)}input+=s});
 process.stdin.on('end',async()=>{try{console.log(JSON.stringify(await drill(JSON.parse(input))))}catch{console.error('Archive validation or isolated restore failed. No production data changed.');process.exitCode=1}});
}
