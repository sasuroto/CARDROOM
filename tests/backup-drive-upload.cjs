/* eslint-disable @typescript-eslint/no-require-imports -- Offline CommonJS runner shares the existing TypeScript test loader. */
// Synthetic data/credentials, fake Google, real in-memory SQLite. No live writes.
const {drill}=require('../scripts/archive-drill.cjs'),A=require('../lib/archive-v2.ts'),O=require('../lib/backup-drive.server.ts');
const E=require('../lib/backup-drive-archive.server.ts'),U=require('../lib/backup-drive-upload.server.ts');
const assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
let checks=0,clock=Date.parse('2026-11-07T12:00:00Z'),calls=[],mode='',wire='',metadata=null,uploads=0,reads=0,hook=null;
const realNow=Date.now;Date.now=()=>clock;
const check=(v,m)=>{assert.ok(v,m);checks++};
const db={prepare(q){const op=args=>({first:async()=>sql.prepare(q).get(...args)||null,run:async()=>sql.prepare(q).run(...args)});return {q,...op([]),bind:(...args)=>op(args)}},
 batch:async qs=>qs.map(({q})=>({success:true,results:sql.prepare(q).all()}))};
const stamp='2026-11-06T10:00:00.000Z';
const records=new Map(A.ARCHIVE_KEYS.map((k,i)=>[k,JSON.stringify(i===0?{revision:'synthetic',lastAttempt:stamp,leagues:A.ARCHIVE_KEYS.slice(1).map(k=>({id:k.split('/')[2].replace('.json','')}))}:{league:k.split('/')[2].replace('.json',''),runId:'synthetic-'+i,startedAt:stamp,completedAt:stamp})]));
const bucket={get:async k=>{reads++;if(hook)hook(k);const v=records.get(k);return v===undefined?null:{size:Buffer.byteLength(v),text:async()=>v}}};
const env={DB:db,BUCKET:bucket,CARDROOM_DRIVE_ENABLED:'true',CARDROOM_DRIVE_UPLOAD_ENABLED:'true',CARDROOM_ALLOW_NONATOMIC_BACKUP:'true',
 CARDROOM_BACKUP_OWNER_ID:'fixture-owner',CARDROOM_DRIVE_CLIENT_ID:'fixture-client.apps.googleusercontent.com',
 CARDROOM_DRIVE_CLIENT_SECRET:'fixture-client-secret',CARDROOM_DRIVE_TOKEN_KEY:Buffer.alloc(32,9).toString('base64url'),
 CARDROOM_ARCHIVE_KEY:Buffer.alloc(32,17).toString('base64url'),CARDROOM_DRIVE_ACCOUNT_EMAIL:'owner@example.test',
 CARDROOM_DRIVE_OAUTH_MODE:'production',CARDROOM_DRIVE_FOLDER_ID:'fixture_folder_123'};
const H={'oai-authenticated-user-id':env.CARDROOM_BACKUP_OWNER_ID,Origin:O.SITE_ORIGIN,'Sec-Fetch-Site':'same-origin'};
const req=(method='POST',headers=H)=>new Request(O.SITE_ORIGIN+'/internal-test-only',{method,headers});
const get=()=>sql.prepare("SELECT * FROM backup_drive_upload WHERE id='primary'").get();
const clear=()=>{sql.exec('DELETE FROM backup_drive_upload; UPDATE backup_drive_flow SET retry_at=0');mode='';hook=null;calls=[];wire='';metadata=null;uploads=0;reads=0};
global.fetch=async(url,init={})=>{
 assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.ok(init.signal);calls.push({url,init});
 if(mode==='hold'&&url.includes('/token')){await new Promise(resolve=>setTimeout(resolve,10))}
 if(mode==='network')throw Error('provider secret leaked?');
 if(mode==='rate')return new Response('DO NOT LOG',{status:429,headers:{'Retry-After':'7200'}});
 if(mode==='forbidden')return new Response('DO NOT LOG',{status:403});
 if(url==='https://oauth2.googleapis.com/token')return Response.json({token_type:'Bearer',scope:mode==='broad'?O.DRIVE_SCOPE+' https://www.googleapis.com/auth/drive':O.DRIVE_SCOPE,access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600});
 if(url.includes('/about?'))return Response.json({user:{emailAddress:mode==='account'?'wrong@example.test':env.CARDROOM_DRIVE_ACCOUNT_EMAIL,permissionId:'fixture-permission'}});
 if(url.includes('/files/'+env.CARDROOM_DRIVE_FOLDER_ID+'?'))return Response.json({id:env.CARDROOM_DRIVE_FOLDER_ID,mimeType:'application/vnd.google-apps.folder',trashed:false,ownedByMe:true,shared:mode==='shared',capabilities:{canAddChildren:mode!=='permission'}});
 if(url.includes('/generateIds?')){if(mode==='reconnect')sql.prepare("UPDATE backup_drive_connection SET revision='synthetic-reconnected' WHERE id='primary'").run();return Response.json({ids:['fixture_file_id_123']})}
 if(url.startsWith('https://www.googleapis.com/upload/')){
  uploads++;check(get().phase==='uploading'&&get().file_id==='fixture_file_id_123','intent persisted before create');
  const parts=init.body.split('\r\n\r\n');metadata=JSON.parse(parts[1].split('\r\n--')[0]);wire=parts[2].split('\r\n--')[0];
  if(mode==='upload-lost')throw Error('timeout after successful write');
  if(mode==='upload-before-write'){wire='';metadata=null;throw Error('timeout before write')}
  return Response.json({id:'fixture_file_id_123'});
 }
 if(url==='https://www.googleapis.com/drive/v3/files/fixture_file_id_123?alt=media')return new Response(mode==='corrupt'?wire+' ':wire);
 if(url.startsWith('https://www.googleapis.com/drive/v3/files/fixture_file_id_123?')){
  if(!metadata)return new Response('not found',{status:404});
  return Response.json({...metadata,id:'fixture_file_id_123',size:String(Buffer.byteLength(wire)),parents:mode==='moved'?['other_folder']:metadata.parents,trashed:false,ownedByMe:true,shared:false});
 }
 throw Error('unexpected URL '+url);
};
async function reason(r,why){check(r.status==='error'&&r.reason===why,why+': '+JSON.stringify(r))}
(async()=>{
 const begin=await O.startDrive(new Request(O.SITE_ORIGIN+'/api/backup-drive/start',{method:'POST',headers:H}),env);
 const state=new URL(begin.headers.get('Location')).searchParams.get('state');
 const callback=new Request(O.SITE_ORIGIN+O.CALLBACK_PATH+'?state='+state+'&code=fixture-code',{headers:{...H,Cookie:begin.headers.get('Set-Cookie').split(';')[0]}});
 check((await O.finishDrive(callback,env)).status===303,'synthetic OAuth only');clear();
 for(const [patch,why] of [[{CARDROOM_DRIVE_UPLOAD_ENABLED:''},'upload-disabled'],[{CARDROOM_ALLOW_NONATOMIC_BACKUP:''},'nonatomic-approval-required'],[{CARDROOM_DRIVE_FOLDER_ID:'https://evil.test'},'upload-unconfigured'],[{CARDROOM_ARCHIVE_KEY:env.CARDROOM_DRIVE_TOKEN_KEY},'archive-key-unconfigured']])await reason(await U.runDriveBackup(req(),{...env,...patch}),why);
 await reason(await U.runDriveBackup(req('GET'),env),'method-not-allowed');
 await reason(await U.runDriveBackup(req('POST',{}),env),'owner-required');
 await reason(await U.runDriveBackup(req('POST',{...H,Origin:'https://evil.test'}),env),'wrong-origin');
 check(!calls.length&&!get()&&!reads,'gates make no provider/storage writes or capture');
 const payload=JSON.stringify({id:'123',league:'epl',kickoff:'2026-11-07T18:00:00Z',picks:[],modelVersion:'synthetic'});
 sql.prepare('INSERT INTO journal_forecasts VALUES (?,?,?,?,?)').run('epl:123','epl','2026-11-07',stamp,payload);
 for(let i=0;i<2;i++){
  const p={id:'123',league:'epl',kind:'score',kickoff:'2026-11-07T18:00:00Z',checkedAt:`2026-11-07T20:0${i}:00Z`,homeStats:{goals:i,yellow:null},awayStats:{goals:1}};
  const {checkedAt,...facts}=p,digest=await E.sha256(JSON.stringify(facts)),id=await E.sha256('epl:123score'+checkedAt+digest);
  sql.prepare('INSERT INTO journal_observations VALUES (?,?,?,?,?,?,?,?,?)').run(id,'epl:123','epl','2026-11-07','score',checkedAt,checkedAt,digest,JSON.stringify(p));
 }
 const exactPayload=JSON.stringify({id:'123',league:'epl',kickoff:'2026-11-07T18:00:00Z',computedAt:stamp,experiment:'cardroom-11/1',status:'ok',poisson:{probability:.12},dc:{probability:.13},sampleSize:101,missing:null});
 sql.prepare('INSERT INTO journal_exact11 VALUES (?,?,?,?,?)').run('epl:123','epl','2026-11-07',stamp,exactPayload);

 let r=await U.runDriveBackup(req(),env);
 check(r.status==='uploaded-verified'&&r.uploadVerified&&!r.offsiteVerified&&!r.restoreDrillVerified&&!r.backupEnabled&&!r.captureAtomic,'honest verified transfer, not restore/scheduled protection');
 check(uploads===1&&reads===34&&get().phase==='verified','one create, two complete 17-record passes');
 check(!wire.includes('fixture-refresh')&&!wire.includes('fixture-client-secret')&&!wire.includes('journal_forecasts')&&!wire.includes(payload),'only encrypted archive transmitted');
 check(calls.every(({url})=>!url.includes('fixture-access')&&!url.includes('fixture-refresh')),'no credentials in URLs');
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
 const alias=env.CARDROOM_ARCHIVE_KEY.slice(0,-1)+alphabet[alphabet.indexOf(env.CARDROOM_ARCHIVE_KEY.at(-1))|1];
 check(alias!==env.CARDROOM_ARCHIVE_KEY&&Buffer.from(alias,'base64url').equals(Buffer.from(env.CARDROOM_ARCHIVE_KEY,'base64url')),'synthetic noncanonical token-key alias decodes identically');
 await assert.rejects(()=>E.archiveKey(env.CARDROOM_ARCHIVE_KEY,alias),/archive-key-unconfigured/);checks++;
 const key=await E.archiveKey(env.CARDROOM_ARCHIVE_KEY),bundle=await E.decryptArchive(wire,key,{folderId:env.CARDROOM_DRIVE_FOLDER_ID,attemptId:r.attemptId});
 const restored=await drill(bundle);
 check(restored.restoreDrillVerified&&restored.forecasts===1&&restored.observations===2&&restored.exactForecasts===1&&restored.recordCount===17&&bundle.body.tables.journal_forecasts[0].payload===payload,'download decrypt and real SQLite isolated restore preserve original rows');
 const child=require('node:child_process').spawn(process.execPath,['scripts/drive-archive-drill.cjs','--folder',env.CARDROOM_DRIVE_FOLDER_ID,'--attempt',r.attemptId],{stdio:['pipe','pipe','pipe','pipe']});
 let output='';child.stdout.on('data',v=>{output+=v});child.stdin.end(wire);child.stdio[3].end(env.CARDROOM_ARCHIVE_KEY);
 const exit=await new Promise(resolve=>child.on('exit',resolve));check(exit===0&&JSON.parse(output).restoreDrillVerified&&!output.includes(payload),'standalone encrypted offline drill uses FD key, prints counts only');

 check(!JSON.stringify(bundle).includes('backup_drive')&&!JSON.stringify(bundle).includes('fixture-refresh'),'all OAuth/upload state excluded');
 const before=calls.length;check((await U.runDriveBackup(req(),env)).status==='already-uploaded'&&calls.length===before&&uploads===1,'repeat same UTC day no duplicate network upload');
 await assert.rejects(()=>E.decryptArchive(wire,key,{folderId:'wrong-folder',attemptId:r.attemptId}));checks++;
 await assert.rejects(async()=>E.decryptArchive(wire,await E.archiveKey(Buffer.alloc(32,18).toString('base64url')),{folderId:env.CARDROOM_DRIVE_FOLDER_ID,attemptId:r.attemptId}));checks++;
 for(const [m,why] of [['broad','refresh-grant-invalid'],['account','google-account-mismatch'],['shared','private-folder-required'],['permission','private-folder-required'],['rate','google-rate-limited'],['forbidden','google-access-denied'],['network','google-request-failed']]){
  clear();mode=m;await reason(await U.runDriveBackup(req(),env),why);check(uploads===0&&get().phase==='failed','failure before upload cannot create');
  const n=calls.length;await reason(await U.runDriveBackup(req(),env),'cooldown');check(n===calls.length,'durable shared cooldown avoids provider retry');
 }
 clear();const saved=records.get(A.ARCHIVE_KEYS[1]);records.delete(A.ARCHIVE_KEYS[1]);await reason(await U.runDriveBackup(req(),env),'missing-record');check(uploads===0,'missing record fails closed');records.set(A.ARCHIVE_KEYS[1],saved);
 clear();hook=()=>{if(reads===18)records.set(A.ARCHIVE_KEYS[1],saved.replace('synthetic-1','changed-run'))};await reason(await U.runDriveBackup(req(),env),'capture-changed');check(!uploads,'changing snapshot never uploaded');records.set(A.ARCHIVE_KEYS[1],saved);
 clear();records.set(A.ARCHIVE_KEYS[1],saved.replace('"runId":','"access_token":"fixture-token", "runId":'));await reason(await U.runDriveBackup(req(),env),'credential-in-archive');check(!uploads,'unexpected credentials fail without redaction');records.set(A.ARCHIVE_KEYS[1],saved);
 clear();mode='reconnect';await reason(await U.runDriveBackup(req(),env),'connection-changed');check(get().phase==='failed'&&uploads===0&&!get().file_id,'known pre-send reconnection does not create an uncertain upload');
 clock+=301000;mode='';check((await U.runDriveBackup(req(),env)).uploadVerified&&uploads===1,'reconnected owner can retry after known pre-send failure');
 clear();mode='upload-lost';await reason(await U.runDriveBackup(req(),env),'google-request-failed');check(get().phase==='uncertain'&&uploads===1,'lost create response retains stable ID');
 clock+=301000;mode='';r=await U.runDriveBackup(req(),env);check(r.status==='uploaded-verified'&&uploads===1&&reads===34,'retry independently reads same ID without recapture or reupload');
 clear();mode='upload-before-write';await reason(await U.runDriveBackup(req(),env),'google-request-failed');clock+=301000;mode='';await reason(await U.runDriveBackup(req(),env),'remote-file-unconfirmed');check(get().phase==='uncertain'&&uploads===1,'missing ambiguous upload blocks duplicate create');
 clear();mode='corrupt';await reason(await U.runDriveBackup(req(),env),'remote-content-mismatch');check(get().phase==='uncertain','corrupt readback never marked verified');
 clear();mode='moved';await reason(await U.runDriveBackup(req(),env),'remote-metadata-mismatch');check(get().phase==='uncertain','moved destination never marked verified');
 clear();mode='hold';const pair=await Promise.all([U.runDriveBackup(req(),env),U.runDriveBackup(req(),env)]);check(pair.filter(r=>r.uploadVerified).length===1&&uploads===1,'concurrent requests produce one create');
 check(pair.some(r=>['upload-in-progress','upload-claim-unconfirmed'].includes(r.reason)),'second concurrent request explicitly blocked');
 clear();const oversized=records.get(A.ARCHIVE_KEYS[0]);records.set(A.ARCHIVE_KEYS[0],oversized.slice(0,-1)+',"data":"'+'a'.repeat(E.DRIVE_PLAIN_LIMIT)+'"}');await reason(await U.runDriveBackup(req(),env),'upload-size-limit');check(!uploads,'bounded multipart payload');records.set(A.ARCHIVE_KEYS[0],oversized);
 clear();let expireOnce=true;
 const deadlineDb={...db,prepare(q){const s=db.prepare(q);if(q==="SELECT * FROM backup_drive_upload WHERE id='primary'")return {...s,first:async()=>{const row=await s.first();if(row?.phase==='uploading'&&expireOnce){expireOnce=false;clock+=120001}return row}};return s}};
 await reason(await U.runDriveBackup(req(),{...env,DB:deadlineDb}),'backup-deadline');
 check(uploads===0&&get().phase==='failed','confirmed intent followed by deadline before fetch is retryable failed, not uncertain');
 clock+=301000;check((await U.runDriveBackup(req(),env)).uploadVerified&&uploads===1,'pre-dispatch timeout can safely retry without duplicate create');
 clear();let loseOnce=true;
 const lostRead={...db,prepare(q){const s=db.prepare(q);if(q==="SELECT * FROM backup_drive_upload WHERE id='primary'")return {...s,first:async()=>{const row=await s.first();if(row?.phase==='uploading'&&loseOnce){loseOnce=false;throw Error('synthetic readback failure')}return row}};return s}};
 await reason(await U.runDriveBackup(req(),{...env,DB:lostRead}),'backup-validation-or-storage-failed');
 check(uploads===0&&get().phase==='uncertain'&&get().file_id==='fixture_file_id_123','uncertain persisted intent cannot regress to failed/retryable after readback loss');
 clock+=301000;await reason(await U.runDriveBackup(req(),env),'remote-file-unconfirmed');check(uploads===0,'intent uncertainty still forbids another create');
 clear();const realSetTimeout=global.setTimeout;let hungReads=0;
 global.setTimeout=(fn,ms,...args)=>realSetTimeout(fn,ms===30000?5:ms,...args);
 try{await assert.rejects(()=>E.captureStableArchive(db,{get:async()=>{hungReads++;return new Promise(()=>{})}}),/capture-window-exceeded/);checks++}finally{global.setTimeout=realSetTimeout}
 check(hungReads===1,'hung R2 read is bounded and cannot start continuation reads');
 check(fs.readFileSync('lib/archive-v2.ts','utf8').includes('ORDER BY ${cols[0]} LIMIT ${MAX_ROWS+1})),0)'), 'SQL size sums only inspect the bounded ordered row prefix');
 clear();const capture=await A.captureArchive(db,bucket);check((await drill(capture)).restoreDrillVerified,'new migration does not alter archive compatibility');
 sql.exec('BEGIN');const insert=sql.prepare('INSERT INTO journal_forecasts VALUES (?,?,?,?,?)');
 for(let i=0;i<A.MAX_ROWS;i++)insert.run('epl:overflow-'+i,'epl','2026-11-07',stamp,'{}');sql.exec('COMMIT');
 await assert.rejects(()=>A.captureArchive(db,bucket),/row-limit/);checks++;
 check(!fs.readdirSync('app/api/backup-drive').includes('upload'),'no live HTTP upload route enabled');
 console.log(`Backup Drive upload: ${checks} checks passed; all network and data synthetic.`);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Date.now=realNow;sql.close()});
