import {readCache,writeCache,writeVerified} from './cache';

const HOUR=3600000;
export const UEFA_BACKOFF='referee-updates/source-backoff/www.uefa.com.json';
const pending=new Map<string,Promise<any>>();
const decode=(s:string)=>s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):''}).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').replace(/&nbsp;/g,' ');
const text=(s:string)=>decode(s.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const nameKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
export function uefaMatchInfoUrl(source:string){
 try{const u=new URL(source);if(u.origin!=='https://www.uefa.com'||u.search||u.hash)return null;const p=u.pathname.match(/^\/uefachampionsleague\/match\/(\d{7}--[a-z0-9-]+)\/(?:matchinfo\/)?$/);return p?`${u.origin}/uefachampionsleague/match/${p[1]}/matchinfo/`:null}catch{return null}
}

// Read UEFA's server-rendered role groups, not names from unrelated page content.
export function parseUEFACrew(html:string,source:string,kickoff:string,referee:string){
 const canonical=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1];
 if(!canonical||uefaMatchInfoUrl(canonical)!==source)throw Error('UEFA: страница другого матча');
 const id=source.match(/\/match\/(\d+)/)?.[1];
 const options=[...html.matchAll(/\bdata-options="([^"]+)"/g)].flatMap(m=>{try{return [JSON.parse(decode(m[1]))]}catch{return []}});
 if(!options.some(o=>String(o.match?.id)===id&&Date.parse(o.match?.kickOffTime?.dateTime||'')===Date.parse(kickoff)))throw Error('UEFA: дата и идентификатор матча не подтверждены');
 const crew:any={};
 const roles:Record<string,string>={'referee':'referee','assistant referees':'assistants','video assistant referee':'var','assistant video assistant referee':'avar','fourth official':'fourthOfficial'};
 for(const block of html.matchAll(/<div\b[^>]*class=["']single-role["'][^>]*>([\s\S]*?)<\/div>/gi)){
  const label=text(block[1].match(/<span\b[^>]*slot="secondary"[^>]*>([\s\S]*?)<\/span>/)?.[1]||'').toLowerCase(),role=roles[label];if(!role)continue;
  const names=[...block[1].matchAll(/<span\b[^>]*slot="primary"[^>]*>([\s\S]*?)<\/span>/g)].map(m=>text(m[1].replace(/<span\b[\s\S]*$/,''))).filter(n=>n.length>2&&n.length<100);
  if(!names.length||new Set(names).size!==names.length||role!=='assistants'&&names.length!==1||crew[role])throw Error('UEFA: неоднозначная роль в бригаде');
  crew[role]=role==='assistants'?names:names[0];
 }
 if(!crew.referee||nameKey(crew.referee)!==nameKey(referee))throw Error('UEFA: главный арбитр не совпадает с назначением');
 if(!crew.assistants&&!crew.var&&!crew.avar&&!crew.fourthOfficial)throw Error('UEFA: бригада не получена');
 return crew;
}

export async function enrichUEFACrew(match:any,bucket:R2Bucket|undefined){
 if(match.league!=='ucl'||!match.referee||!Number.isFinite(Date.parse(match.date||'')))return match;
 const source=uefaMatchInfoUrl(match.appointmentSource||'');if(!source)return match;
 const key=`official-appointments/uefa/crew/v2/${source.match(/\/match\/(\d+)/)![1]}.json`;
 const identity=`${match.date}|${nameKey(match.referee)}`;
 const prior=await readCache(bucket,key),cached=prior?.identity===identity?prior:null,now=Date.now();
 const apply=(r:any)=>{
  const fields=['assistants','var','avar','fourthOfficial'];
  // A successful partial response replaces only its own roles; no unverified mixing.
  const values=r.crew?Object.fromEntries(fields.map(f=>[f,r.crew[f]??null])):{};
  return {...match,...values,crewSource:source,crewCheckedAt:r.checkedAt||null,crewLastAttemptAt:r.lastAttemptAt||null,crewNextCheckAt:r.nextCheckAt,crewStale:!!r.stale,crewError:r.error||null,crewPersisted:r.persisted===true,crewComplete:!!r.crew&&fields.every(f=>Array.isArray(r.crew[f])?r.crew[f].length===2:!!r.crew[f])};
 };
 if(cached&&Date.parse(cached.nextCheckAt)>now)return apply({...cached,persisted:true});
 const requestKey=key+'|'+identity;
 if(!pending.has(requestKey))pending.set(requestKey,(async()=>{
  const stamp=new Date(now).toISOString();let next=now+HOUR;
  try{
   const backoff=await readCache(bucket,UEFA_BACKOFF);
   if(backoff?.until>now){next=backoff.until;throw Error('UEFA: действует пауза источника до '+new Date(next).toISOString())}
   const r=await fetch(source,{redirect:'manual',signal:AbortSignal.timeout(14000),headers:{Accept:'text/html'}});
   if(!r.ok){
    const retry=r.headers.get('Retry-After'),seconds=Number(retry),until=retry?(Number.isFinite(seconds)?now+seconds*1000:Date.parse(retry)):0;
    next=Math.max(next,r.status===403?now+6*HOUR:0,until||0);
    if(r.status===403||r.status===429)await writeCache(bucket,UEFA_BACKOFF,{until:next,status:r.status,checkedAt:stamp});
    throw Error('UEFA HTTP '+r.status);
   }
   const html=await r.text();if(html.length>3000000)throw Error('UEFA: ответ слишком большой');
   const crew=parseUEFACrew(html,source,match.date,match.referee);
   const result={identity,source,crew,checkedAt:stamp,lastAttemptAt:stamp,nextCheckAt:new Date(next).toISOString(),stale:false,error:null,revision:crypto.randomUUID()};
   const saved=await writeVerified(bucket,key,result);
   return {...result,persisted:saved.ok,...(!saved.ok?{error:saved.error}:{})};
  }catch(e){
   const result={...(cached||{}),identity,source,lastAttemptAt:stamp,nextCheckAt:new Date(next).toISOString(),stale:true,error:String(e),revision:crypto.randomUUID()};
   const saved=await writeVerified(bucket,key,result);return {...result,persisted:saved.ok};
  }
 })());
 try{return apply(await pending.get(requestKey))}finally{pending.delete(requestKey)}
}
