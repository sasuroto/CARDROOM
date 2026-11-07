/* eslint-disable @typescript-eslint/no-require-imports -- Offline CommonJS runner shares the existing TypeScript test loader. */
// Offline encrypted recovery rehearsal. Key on FD 3, ciphertext on stdin.
// No network, output payload, persistent database or production target.
const {drill}=require('./archive-drill.cjs');
const {archiveKey,decryptArchive,DRIVE_WIRE_LIMIT}=require('../lib/backup-drive-archive.server.ts');
const fs=require('node:fs');
async function bounded(stream,max){const chunks=[];let size=0;for await(const chunk of stream){size+=chunk.length;if(size>max)throw Error('limit');chunks.push(chunk)}return Buffer.concat(chunks).toString('utf8')}
async function main(){
 if(process.argv.length!==6||process.argv[2]!=='--folder'||process.argv[4]!=='--attempt'||
  !/^[A-Za-z0-9_-]{10,200}$/.test(process.argv[3])||!/^[a-z0-9-]{36}$/.test(process.argv[5]))throw Error('arguments');
 const [wire,keyText]=await Promise.all([bounded(process.stdin,DRIVE_WIRE_LIMIT),bounded(fs.createReadStream(null,{fd:3,autoClose:false}),128)]);
 const key=await archiveKey(keyText.trim());
 const bundle=await decryptArchive(wire,key,{folderId:process.argv[3],attemptId:process.argv[5]});
 console.log(JSON.stringify(await drill(bundle)));
}
if(require.main===module)main().catch(()=>{console.error('Encrypted archive or isolated restore validation failed. Supply expected folder/attempt arguments, ciphertext on stdin and the independent key on FD 3. No production data changed.');process.exitCode=1});
