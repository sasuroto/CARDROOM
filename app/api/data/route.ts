import {withDataHealth} from '../../../lib/data-health';
import {mergeDataSnapshot} from '../../../lib/data-snapshot';
import {mergeRefereeUpdates} from '../../../lib/referee-updates';
import {readCache,writeCache,writeVerified} from '../../../lib/cache';
import {createSourceReader} from '../../../lib/source-fetch';
import {blockDue,blockErrors,mergeBlockStatus,refreshTasks,runRefresh} from '../../../lib/data-refresh';
import refSeed from '../../../lib/referees.json';
import {env} from 'cloudflare:workers';
import {initialData} from '../../../lib/data';
export const dynamic='force-dynamic';
const KEY='cardroom/data-v1.json',LOCK='cardroom/data-refresh-lock.json';
// One pass at a time; its budget stays well inside a request, so it always reaches the save.
export const PASS_BUDGET=25000;
const SOURCE_LIMITS={gapMs:1500,maxPerOrigin:6,timeoutMs:12000};
let running:Promise<any>|null=null;

function load(saved:any){
 const data:any=mergeDataSnapshot(initialData,saved);
 data.refereesByLeague={...structuredClone(refSeed),...(data.refereesByLeague||{})};
 if(data.refereesByLeague.epl.source!==refSeed.epl.source)data.refereesByLeague.epl=structuredClone(refSeed.epl);
 return data;
}
const respond=async(data:any,bucket:R2Bucket|undefined)=>Response.json(withDataHealth(await mergeRefereeUpdates(data,bucket)),{headers:{'Cache-Control':'no-store'}});

export async function GET(){
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET,now=Date.now();
 const data=load(await readCache(bucket,KEY)),tasks=refreshTasks(data,refSeed as Record<string,any>);
 data.pendingBlocks=tasks.filter(t=>blockDue(data.blockStatus?.[t.id],t.checkedAt,now)).length;
 if(!data.pendingBlocks)return respond(data,bucket);
 const lock=await readCache(bucket,LOCK);
 if(running||lock?.until>now){data.refreshInProgress=true;return respond(data,bucket)}
 running=pass(bucket,data,tasks,now);
 try{return respond(await running,bucket)}finally{running=null}
}

async function pass(bucket:R2Bucket|undefined,data:any,tasks:ReturnType<typeof refreshTasks>,now:number){
 const deadline=now+PASS_BUDGET;
 await writeCache(bucket,LOCK,{until:deadline+5000});
 const source=createSourceReader(bucket,{deadline,...SOURCE_LIMITS});
 const result=await runRefresh(data,tasks,source,now);
 data.lastAttempt=new Date(now).toISOString();data.parserVersion=7;data.updatedFields=result.ok;data.lastPass=result;data.pendingBlocks=result.deferred;
 data.refreshStatus=result.ok?(result.failed||result.deferred?'partial':'updated'):'sources-unavailable';
 // Another pass may have saved meanwhile: keep the newer copy of every block.
 const latest=await readCache(bucket,KEY);
 const merged=latest?.leagues?{...mergeDataSnapshot(latest,data),blockStatus:mergeBlockStatus(latest.blockStatus,data.blockStatus)}:data;
 merged.refreshErrors=blockErrors(merged.blockStatus);merged.revision=crypto.randomUUID();
 const toSave={...merged,revision:merged.revision};delete toSave.persisted;
 merged.persisted=await writeVerified(bucket,KEY,toSave);
 await writeCache(bucket,LOCK,{until:0});
 return merged;
}
