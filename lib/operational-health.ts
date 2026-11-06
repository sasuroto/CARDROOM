import {inspectCache} from './cache';
import {dataHealth,SUMMARY_INTERVAL} from './data-health';

const HOUR=60*60*1000;
export const HEALTH_GRACE_MS=30*60*1000;
const object=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const timestamp=(v:any,now:number)=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=now?Date.parse(v):null;
const count=(v:any)=>Number.isInteger(v)&&v>=0?v:null;
const stamp=(v:any,now:number)=>timestamp(v,now)===null?null:v;

// Fixed-key, read-only diagnostics: no provider calls, writes, credentials or raw error strings.
// A stored report proves it can be read, NOT that the scheduler ran or a future write will succeed.
export async function operationalHealth(bucket:R2Bucket|undefined,leagueIds:string[],now=Date.now()){
 const results=await Promise.all([
  inspectCache(bucket,'cardroom/data-v1.json'),
  ...leagueIds.map(id=>inspectCache(bucket,`referee-updates/v1/${id}.json`))
 ]);
 const storage=results.some(r=>r.status==='unconfigured')?'unconfigured':results.some(r=>r.status==='error')?'read-error':'readable';
 const alerts:{code:string;league?:string}[]=[];
 if(storage!=='readable')alerts.push({code:'storage-'+storage});
 const summaryRead=results[0],raw=summaryRead.value;
 const summaryValid=summaryRead.status==='ok'&&object(raw)&&typeof raw.revision==='string'&&raw.revision.length>0&&Array.isArray(raw.leagues)&&raw.leagues.length>0&&raw.leagues.every((l:any)=>object(l)&&typeof l.id==='string');
 const summaryTime=summaryValid?timestamp(raw.lastAttempt,now):null;
 const summaryState=summaryRead.status!=='ok'?summaryRead.status:!summaryValid||summaryTime===null?'invalid':now-summaryTime>SUMMARY_INTERVAL+HEALTH_GRACE_MS?'overdue':'current';
 if(summaryState!=='current')alerts.push({code:'summary-'+summaryState});
 const reports:Record<string,any>={};
 const referees=leagueIds.map((league,i)=>{
  const read=results[i+1],r=read.value;
  const start=timestamp(r?.startedAt,now),end=timestamp(r?.completedAt,now);
  const next=typeof r?.nextCheckAt==='string'?Date.parse(r.nextCheckAt):NaN;
  const valid=read.status==='ok'&&object(r)&&r.league===league&&typeof r.runId==='string'&&r.runId.length>0&&start!==null&&end!==null&&end>=start&&Number.isFinite(next)&&next===start+HOUR;
  const state=read.status!=='ok'?read.status:!valid?'invalid':now>next+HEALTH_GRACE_MS?'overdue':now>=next?'due':'current';
  if(!['current','due'].includes(state))alerts.push({code:'referee-'+state,league});
  if(valid)reports[league]={...r,errors:Array.isArray(r.errors)?r.errors.filter((e:any)=>typeof e==='string'):[]};
  const statsTime=valid?timestamp(r.stats?.checkedAt,now):null;
  const statsState=statsTime===null?'missing':r.statsStatus==='snapshot'?'snapshot':r.statsStatus!=='updated'?'unavailable':now-statsTime>SUMMARY_INTERVAL?'stale':'fresh';
  if(statsState!=='fresh')alerts.push({code:'referee-statistics-'+statsState,league});
  const coverage=valid&&object(r.appointmentCoverage)?Object.fromEntries(['official','fallback','stale','missing','completed'].map(k=>[k,count(r.appointmentCoverage[k])])):null;
  if(!coverage||Object.values(coverage).some(v=>v===null))alerts.push({code:'appointment-coverage-unknown',league});
  else if((coverage.missing||0)+(coverage.stale||0)>0)alerts.push({code:'appointments-incomplete',league});
  if(valid&&Array.isArray(r.errors)&&r.errors.length)alerts.push({code:'referee-source-errors',league});
  const health=valid?r.sourceHealth?.statistics:null;
  return {league,state,runId:valid?r.runId:null,lastAttempt:valid?r.startedAt:null,completedAt:valid?r.completedAt:null,nextCheckAt:valid?r.nextCheckAt:null,
   storedReportReadable:valid,statistics:{state:statsState,lastSuccess:statsTime===null?null:r.stats.checkedAt,httpStatus:count(health?.httpStatus),retryAt:typeof health?.retryAt==='string'&&Number.isFinite(Date.parse(health.retryAt))?health.retryAt:null},appointments:coverage};
 });
 // Use persisted fields only. Never substitute committed seeds to make storage look healthy.
 const summaryData=summaryValid?{...raw,leagues:leagueIds.map(id=>raw.leagues.find((l:any)=>l.id===id)||{id}),refereeUpdates:reports,refereesByLeague:{...(raw.refereesByLeague||{})},refreshErrors:Array.isArray(raw.refreshErrors)?raw.refreshErrors.filter((e:any)=>typeof e==='string'):[]}:null;
 if(summaryData){
  for(const [id,r] of Object.entries(reports))if(timestamp(r.stats?.checkedAt,now)!==null&&Date.parse(r.stats.checkedAt)>=(Date.parse(summaryData.refereesByLeague[id]?.checkedAt)||0))summaryData.refereesByLeague[id]=r.stats;
 }
 const blocks=summaryData?dataHealth(summaryData,now):null;
 if(blocks?.blocks.some((b:any)=>b.checkedAt&&timestamp(b.checkedAt,now)===null))alerts.push({code:'summary-invalid-block-date'});
 if(blocks&&blocks.status!=='updated')alerts.push({code:'summary-coverage-incomplete'});
 return {schemaVersion:1,readOnly:true,checkedAt:new Date(now).toISOString(),status:storage!=='readable'?'unavailable':alerts.length?'degraded':'healthy',
  storage:{state:storage,writeVerifiedThisRequest:false},scheduler:{verifiedThisRequest:false,evidence:'Persisted reports only; inspect scheduler run history separately.'},
  thresholds:{refereeIntervalMinutes:60,summaryIntervalHours:6,overdueGraceMinutes:30},
  summary:{state:summaryState,lastAttempt:summaryValid?stamp(raw.lastAttempt,now):null,revision:summaryValid&&typeof raw.revision==='string'?raw.revision:null,
   updatedFields:summaryValid?count(raw.updatedFields):null,coverage:blocks?{status:blocks.status,counts:blocks.counts,total:blocks.total}:null},referees,alerts};
}
