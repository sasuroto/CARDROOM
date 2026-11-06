import {readCache,writeCache} from './cache';
import {withAppointment} from './fixture-display';

export const DFB_SOURCE='https://datencenter.dfb.de/global_referee_schedule';
const KEY='official-appointments/dfb/v1.json',HOUR=3600000;
let pending:Promise<any>|null=null;
const clean=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases:Record<string,string>={bayernmunich:'bayernmunchen',bayer04leverkusen:'bayerleverkusen',eintrachtfrankfurt:'frankfurt',hamburgersv:'hamburg',fcaugsburg:'augsburg',scfreiburg:'freiburg',fcunionberlin:'unionberlin','1fcunionberlin':'unionberlin','1fckoln':'cologne',fckoln:'cologne',koln:'cologne',borussiamonchengladbach:'monchengladbach',scpaderborn07:'paderborn',tsghoffenheim:'hoffenheim','tsg1899hoffenheim':'hoffenheim',fcschalke04:'schalke04',vflwolfsburg:'wolfsburg',fcheidenheim1846:'heidenheim','1fcheidenheim1846':'heidenheim','1fsvmainz05':'mainz'};
Object.assign(aliases,{fccologne:'cologne',hamburgsv:'hamburg'});
const team=(s:string)=>aliases[normal(s)]||normal(s);

export function parseDFBOfficials(html:string){
 const section=html.split(/<h6\b[^>]*>/i).find(s=>/^\s*Bundesliga\s*<\/h6>/i.test(s));
 if(!section)throw Error('DFB: раздел Bundesliga не найден');
 const rows:any[]=[];
 for(const block of section.split(/<div\s+id="match_\d+"[^>]*>/i).slice(1)){
  const date=clean(block).match(/\b(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})\s+Uhr/);
  const home=block.match(/class="[^"]*c-MatchTable-team--home[^"]*"[^>]*>([\s\S]*?)<\/div>/i),away=block.match(/class="[^"]*c-MatchTable-team--away[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const roles=new Map<string,string>();
  for(const entry of block.matchAll(/<(?:a|span)\b[^>]*class="c-MatchTable-link"[^>]*>([\s\S]*?)<\/(?:a|span)>/gi)){
   const m=clean(entry[1]).match(/^(.+?)\s+\((SR|SR-A\. 1|SR-A\. 2|4\. Offizieller|VA|VA-A)\)$/);if(m)roles.set(m[2],m[1]);
  }
  if(!date||!home||!away||!roles.get('SR'))continue;
  rows.push({day:`${date[3]}-${date[2]}-${date[1]}`,home:clean(home[1]),away:clean(away[1]),referee:roles.get('SR'),assistants:[roles.get('SR-A. 1'),roles.get('SR-A. 2')].filter(Boolean),fourthOfficial:roles.get('4. Offizieller')||null,var:roles.get('VA')||null,avar:roles.get('VA-A')||null});
 }
 if(!rows.length)throw Error('DFB: назначения не распознаны');
 return rows;
}

export async function getDFBOfficials(bucket:R2Bucket|undefined){
 const cached=await readCache(bucket,KEY),now=Date.now();
 if(cached&&Date.parse(cached.nextCheckAt)>now)return cached;
 if(pending)return pending;
 pending=(async()=>{
  try{
   const response=await fetch(DFB_SOURCE,{signal:AbortSignal.timeout(14000),headers:{Accept:'text/html'}});
   if(!response.ok){
    const retry=response.headers.get('Retry-After'),seconds=retry?Number(retry):NaN;
    const retryAt=retry?(Number.isFinite(seconds)?now+seconds*1000:Date.parse(retry)):0;
    throw Object.assign(Error(`DFB HTTP ${response.status}`),{retryAt:Math.max(now+(response.status===403?6:1)*HOUR,retryAt||0)});
   }
   const rows=parseDFBOfficials(await response.text()),checkedAt=new Date(now).toISOString();
   // Retain dated historical rows when the rolling schedule removes completed matches.
   const identities=new Set(rows.map(r=>`${r.day}:${team(r.home)}:${team(r.away)}`));
   const history=(cached?.rows||[]).filter((r:any)=>!identities.has(`${r.day}:${team(r.home)}:${team(r.away)}`)&&Date.parse(r.day)>now-30*24*HOUR).map((r:any)=>({...r,absent:true}));
   const result={rows:[...rows.map(r=>({...r,checkedAt,absent:false})),...history],checkedAt,lastAttemptAt:checkedAt,nextCheckAt:new Date(now+HOUR).toISOString(),stale:false,source:DFB_SOURCE};
   await writeCache(bucket,KEY,result);return result;
  }catch(error){
   const result={...(cached||{rows:[],source:DFB_SOURCE}),stale:true,error:String(error),lastAttemptAt:new Date(now).toISOString(),nextCheckAt:new Date(Math.max(now+HOUR,(error as any).retryAt||0)).toISOString()};
   await writeCache(bucket,KEY,result);return result;
  }
 })();
 try{return await pending}finally{pending=null}
}

export function applyDFBOfficials(match:any,report:any){
 if(match.league!=='bundesliga'||!match.home||!match.away||!Number.isFinite(Date.parse(match.date||'')))return match;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(match.date));
 const rows=report.rows.filter((r:any)=>r.day===day&&team(r.home)===team(match.home)&&team(r.away)===team(match.away));
 if(rows.length!==1)return match;
 const row=rows[0],stale=!!report.stale||!!row.absent;
 return withAppointment(match,{referee:row.referee,assistants:row.assistants,var:row.var,avar:row.avar,fourthOfficial:row.fourthOfficial,appointmentSource:DFB_SOURCE,appointmentType:'DFB · официальное назначение',appointmentCheckedAt:row.checkedAt||report.checkedAt,appointmentLastAttempt:report.lastAttemptAt||report.checkedAt,appointmentStale:stale,currentVerified:!stale,appointmentError:report.error||(row.absent?'Назначение сохранено из предыдущего официального расписания.':null)});
}
