import {readCache,writeCache} from './cache';
const SOURCE='https://www.uefa.com/uefachampionsleague/news/02a9-218880e7a2aa-96adf63aa534-1000--who-is-the-referee-which-officials-are-in-charge-of-the-uefa/';
const KEY='official-appointments/uefa/2026-27/v1.json',HOUR=3600000;
let pending:Promise<any>|null=null;
const clean=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ø/g,'o').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases:Record<string,string>={asroma:'roma',fcporto:'porto'};
// Explicit provider aliases; never fuzzy-match a different opponent.
Object.assign(aliases,{vfbstuttgart:'stuttgart',slaviaprague:'slaviapraha',sabahfk:'sabah',atleticomadrid:'atleticodemadrid',vikingfk:'viking',bayernmunich:'bayernmunchen',internazionale:'inter',feyenoordrotterdam:'feyenoord',rbleipzig:'leipzig',lasklinz:'lask'});
const team=(s:string)=>aliases[normal(s)]||normal(s);
export function parseUEFAOfficials(html:string){
 if(!html.includes('UEFA Champions League'))throw Error('Турнир не подтверждён');
 const rows:any[]=[];
 for(const paragraph of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)){
  const date=clean(paragraph[1]).match(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(2026|2027)\b/);
  if(!date)continue;
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const day=`${date[3]}-${String(months.indexOf(date[2])+1).padStart(2,'0')}-${date[1].padStart(2,'0')}`;
  for(const link of paragraph[1].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)){
   const m=clean(link[2]).match(/^(.+?) vs (.+?)\s+[–—]\s+(.+?)\s+\(([A-Z]{3})\)$/);
   if(!m||!link[1].startsWith('https://www.uefa.com/uefachampionsleague/match/'))continue;
   rows.push({day,home:m[1],away:m[2],referee:m[3],country:m[4],source:link[1]});
  }
 }
 if(!rows.length)throw Error('Назначения UEFA не найдены');
 return rows;
}
export async function getUEFAOfficials(bucket:R2Bucket|undefined){
 const cached=await readCache(bucket,KEY),now=Date.now();
 if(cached&&Date.parse(cached.nextCheckAt)>now)return cached;
 if(pending)return pending;
 pending=(async()=>{
  try{
   const r=await fetch(SOURCE,{signal:AbortSignal.timeout(14000),headers:{Accept:'text/html'}});
   if(!r.ok){const retry=r.headers.get('Retry-After'),seconds=Number(retry),until=retry?(Number.isFinite(seconds)?now+seconds*1000:Date.parse(retry)):0;throw Object.assign(Error('UEFA HTTP '+r.status),{retryAt:Math.max(now+HOUR,until||0)})}
   const rows=parseUEFAOfficials(await r.text()),checkedAt=new Date(now).toISOString();
   const result={rows,checkedAt,nextCheckAt:new Date(now+HOUR).toISOString(),stale:false,source:SOURCE};await writeCache(bucket,KEY,result);return result;
  }catch(e){const result={...(cached||{rows:[],source:SOURCE}),stale:true,error:String(e),lastAttemptAt:new Date(now).toISOString(),nextCheckAt:new Date(Math.max(now+HOUR,(e as any).retryAt||0)).toISOString()};await writeCache(bucket,KEY,result);return result}
 })();
 try{return await pending}finally{pending=null}
}
export function applyUEFAOfficials(match:any,report:any){
 if(match.league!=='ucl'||!match.date||!match.home||!match.away)return match;
 const day=new Date(match.date).toISOString().slice(0,10);
 const rows=report.rows.filter((r:any)=>r.day===day&&team(r.home)===team(match.home)&&team(r.away)===team(match.away));
 if(rows.length!==1)return match;
 if(report.stale&&match.referee&&match.currentVerified&&Date.parse(match.appointmentCheckedAt||'')>=Date.parse(report.checkedAt||''))return match;
 const row=rows[0],missingError=match.error==='В свежем ответе нет имени арбитра. Сохранённое назначение повторно не подтверждено.';
 return {...match,...(missingError&&!report.stale?{error:null,stale:false}:{}),referee:row.referee,appointmentSource:row.source,appointmentCheckedAt:report.checkedAt,appointmentLastAttempt:report.lastAttemptAt||report.checkedAt,appointmentType:'UEFA · официальное назначение',appointmentStale:!!report.stale,appointmentError:report.error||null,currentVerified:!report.stale};
}
