import seed from './pl-officials-snapshot.json';
import {readCache,writeCache} from './cache';

const KEY='official-appointments/pl/4731949/v1.json',BACKOFF='referee-updates/source-backoff/www.premierleague.com.json',HOUR=3600000;
let pending:Promise<any>|null=null;
const text=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export function parsePLOfficials(html:string){
 if(!/2026\s*\/\s*27/.test(html)||!html.includes('Match officials for Matchweek 7'))throw Error('Турнир и сезон публикации не подтверждены');
 const rows=html.split(/data-match-reference=["']/).slice(1).flatMap(chunk=>{
  const reference=chunk.match(/^(\d+)["']/)?.[1],paragraph=chunk.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const role=paragraph&&text(paragraph).match(/^Referee:\s*(.*?)\.\s*Assistants:\s*(.*?)\.\s*Fourth official:\s*(.*?)\.\s*VAR:\s*(.*?)\.\s*Assistant VAR:\s*(.*?)\.?$/);
  const match=seed.matches.find(m=>m.reference===reference);if(!match||!role)return [];
  const name=(s:string)=>s.replace(/\s*\(pictured\)/,'').replace(/\.$/,'').trim();
  const [referee,assistants,fourthOfficial,varName,avar]=role.slice(1).map(name);
  if([referee,fourthOfficial,varName,avar,...assistants.split(/,\s*/)].some(n=>!n||n.length>90||!/[A-Za-z]/.test(n)))return [];
  return [{...match,referee,assistants:assistants.split(/,\s*/),fourthOfficial,var:varName,avar}];
 });
 if(rows.length!==seed.matches.length||new Set(rows.map(m=>m.id)).size!==rows.length)throw Error('Публикация назначений неполная или изменила структуру');
 return rows;
}
export function plMatch(match:any){
 const candidate=seed.matches.find(m=>m.league===match?.league&&m.id===String(match?.id));if(!candidate)return null;
 if((match.date&&Date.parse(match.date)!==Date.parse(candidate.date))||(match.home&&match.home!==candidate.home)||(match.away&&match.away!==candidate.away))return null;
 return candidate;
}
export async function getPLOfficials(bucket:R2Bucket|undefined){
 const cached=await readCache(bucket,KEY),now=Date.now();
 if(cached&&Date.parse(cached.nextCheckAt)>now)return cached;
 if(pending)return pending;
 pending=refreshPLOfficials(bucket,cached);
 try{return await pending}finally{pending=null}
}
async function refreshPLOfficials(bucket:R2Bucket|undefined,cached:any){
 const now=Date.now();
 const prior=cached?.matches?.length?cached:seed,checkedAt=new Date(now).toISOString();
 try{
  const backoff=await readCache(bucket,BACKOFF);if(backoff?.until>now)throw Object.assign(Error('Ограничение запросов Premier League'),{retryAt:backoff.until});
  const response=await fetch(seed.source,{signal:AbortSignal.timeout(14000),headers:{Accept:'text/html'}});
  if(response.status===429){const retry=response.headers.get('Retry-After'),seconds=Number(retry),until=Math.max(now+HOUR,retry?(Number.isFinite(seconds)?now+seconds*1000:Date.parse(retry))||0:0);await writeCache(bucket,BACKOFF,{until});throw Object.assign(Error('Premier League: HTTP 429'),{retryAt:until})}
  if(!response.ok)throw Error('Premier League: HTTP '+response.status);
  const matches=parsePLOfficials(await response.text()),result={source:seed.source,matches,checkedAt,lastAttemptAt:checkedAt,nextCheckAt:new Date(now+HOUR).toISOString(),stale:false};
  await writeCache(bucket,KEY,result);return result;
 }catch(error){
  console.warn('Premier League appointment refresh:',String(error));
  const result={...prior,stale:true,lastAttemptAt:checkedAt,nextCheckAt:new Date(Math.max(now+5*60000,(error as any)?.retryAt||0)).toISOString(),sourceError:String(error),error:'Повторная проверка Premier League недоступна. Показано последнее подтверждение с указанной датой.'};
  await writeCache(bucket,KEY,result);return result;
 }
}
export function applyPLOfficials(match:any,report:any){
 const candidate=plMatch(match),row=candidate&&report.matches?.find((r:any)=>r.id===candidate.id);if(!row)return match;
 // A failed official recheck cannot replace a newer, verified appointment.
 if(report.stale&&match.referee&&match.currentVerified&&Date.parse(match.appointmentCheckedAt||match.checkedAt)>Date.parse(report.checkedAt))return match;
 const {referee,assistants,var:varName,avar,fourthOfficial}=row;
 return {...match,referee,assistants,var:varName,avar,fourthOfficial,appointmentSource:seed.source,appointmentCheckedAt:report.checkedAt,appointmentLastAttempt:report.lastAttemptAt||report.checkedAt,appointmentType:'Premier League · официальное назначение',appointmentStale:!!report.stale,currentVerified:!report.stale,appointmentError:report.error||null};
}
