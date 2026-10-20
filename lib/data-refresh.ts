import {clean,parseCards,parseOverview,parseTeams,tableRows} from './data';
import {parseReferees,parseSoccerbase} from './referee-parser';
import {SourceError} from './source-fetch';

// Every block (league × summary) has its own schedule. A pass refreshes only the
// blocks that are due, inside a time budget; a slow, blocked or broken source
// fails its own blocks and leaves the rest of the pass and the saved data intact.
export const BLOCK_INTERVAL=6*60*60*1000;
const RETRY=[15*60000,60*60000,3*3600000,6*3600000];
export type BlockStatus={attemptedAt?:string;okAt?:string;error?:string|null;nextAt?:string;failures?:number};
type Task={id:string;url:string;checkedAt:string|null|undefined;apply:(html:string,now:string)=>void};
const time=(v:any)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):NaN;

export function blockDue(status:BlockStatus|undefined,checkedAt:string|null|undefined,now:number){
 if(status?.nextAt)return now>=Date.parse(status.nextAt);
 const at=time(checkedAt);return !Number.isFinite(at)||now-at>=BLOCK_INTERVAL;
}

export function refreshTasks(data:any,refSeed:Record<string,any>):Task[]{
 const tasks:Task[]=[];
 for(const l of data.leagues){
  const ensure=(html:string)=>{const txt=clean(html);if(!txt.includes(l.season)&&!txt.includes(l.season.replace('/','/20')))throw new Error('Сезон не подтверждён')};
  tasks.push({id:l.id+':cards',url:l.cards.source,checkedAt:l.cards.checkedAt,apply:(html,now)=>{ensure(html);const parsed=parseCards(html);if(parsed.n<l.cards.n)throw new Error('Уменьшилась выборка');l.cards={...l.cards,...parsed,checkedAt:now}}});
  tasks.push({id:l.id+':overview',url:l.overview.source,checkedAt:l.overview.checkedAt,apply:(html,now)=>{ensure(html);l.overview={...l.overview,...parseOverview(html),checkedAt:now}}});
  if(l.id!=='segunda'&&l.teamSource&&l.teamRefreshMode!=='snapshot')tasks.push({id:l.id+':yellow',url:l.teamSource,checkedAt:l.teamCheckedAt,apply:(html,now)=>{
   ensure(html);const teams=parseTeams(html);if(teams.length<l.teams.length)throw new Error('Неполная выдача');for(const t of teams){const old=l.teams.find((x:any)=>x.name===t.name);if(old&&t.n<old.n)throw new Error('Устаревшая выборка')}
   l.teams=teams;l.teamCheckedAt=now;const size=['bundesliga','ligue1','superlig','primeira'].includes(l.id)?18:l.id==='ucl'?36:20;l.partial=teams.length<size;
   if(!l.partial&&l.id!=='ucl'){const games=teams.reduce((s,t)=>s+t.n,0)/2;const own=teams.reduce((s,t)=>s+t.n*t.yellow,0);const opp=teams.reduce((s,t)=>s+t.n*t.opp,0);if(Math.abs(own-opp)/Math.max(own,1)<.02)l.yellowSummary={n:games,avg:+(own/games).toFixed(2),derived:true,source:l.teamSource,checkedAt:now};l.teamNote='Полная таблица источника; сезон '+l.season;}
  }});
  if(l.cornerSource)tasks.push({id:l.id+':corners',url:l.cornerSource,checkedAt:l.cornerCheckedAt,apply:(html,now)=>{
   ensure(html);const rows=tableRows(html);const table=rows.find(t=>t.some(r=>r.includes('CF')&&r.includes('TG')&&r.includes('Team')));if(!table)throw new Error('Таблица не найдена');const head=table.find(r=>r.includes('CF'))!;
   const rows2=table.filter(r=>/^\d+$/.test(r[head.indexOf('TG')]||'')&&['CF','CA','O9.5'].every(k=>/^\d+(?:\.\d+)?$/.test(r[head.indexOf(k)]||''))).map(r=>({name:r[head.indexOf('Team')],n:+r[head.indexOf('TG')],for:+r[head.indexOf('CF')],against:+r[head.indexOf('CA')],over95:+r[head.indexOf('O9.5')]})).filter(r=>r.n>0&&r.for>=0&&r.for<25&&r.against>=0&&r.against<25);
   if(!rows2.length||rows2.length<l.corners.length)throw new Error('Неполная выдача');if(rows2.some(r=>{const old=l.corners.find((x:any)=>x.name===r.name);return old&&r.n<old.n}))throw Error('Устаревшая выборка угловых');l.corners=rows2;l.cornerCheckedAt=now;
  }});
 }
 const segunda=data.leagues.find((l:any)=>l.id==='segunda');
 if(segunda?.teamSource)tasks.push({id:'segunda:yellow-summary',url:segunda.teamSource,checkedAt:segunda.yellowSummary?.checkedAt,apply:(html,now)=>{
  for(const table of tableRows(html)){const row=table.find(r=>r[0]==='Current season'&&r[1]==='Spain'&&r[2]==='LaLiga2');if(!row)continue;const n=+row[3],avg=+row[4],home=+row[5],away=+row[6];
   if(!(n>=segunda.yellowSummary.n&&avg>=0&&avg<15&&Math.abs(home+away-avg)<.04))throw Error('Сводка не прошла проверку');segunda.yellowSummary={n,avg,home,away,over35:+row[9],over45:+row[11],over55:+row[13],source:segunda.teamSource,checkedAt:now};return}
  throw Error('Строка LaLiga2 не найдена');
 }});
 // Fixed-source ingestion only. The public API accepts no uploaded data or target URL.
 if(data.refSource)tasks.push({id:'laliga:referees-top',url:data.refSource,checkedAt:data.refCheckedAt,apply:(html,now)=>{
  const table=tableRows(html).find(t=>t.some(r=>r.includes('Referee')&&r.some(c=>c.includes('Avg Match Cards'))));if(!table)throw Error('Таблица не найдена');const h=table.find(r=>r.includes('Referee'))!;
  const updated=table.filter(r=>r[h.indexOf('Period')]==='Current season'&&r[h.indexOf('League')]==='LaLiga').slice(0,10).map(r=>({name:r[h.indexOf('Referee')],league:'La Liga',n:+r[h.findIndex(c=>c.includes('Matches Refereed'))],yellow:+r[h.findIndex(c=>c.includes('Avg Match Cards'))],over45:+r[h.findIndex(c=>c.includes('Over 4.5'))],careerN:null,careerYellow:null}));
  if(!(updated.length>=data.referees.length&&updated.every(r=>r.n>0&&r.yellow>=0&&r.yellow<15)))throw Error('Неполная выдача');data.referees=updated;data.refCheckedAt=now;
 }});
 for(const [id,config] of Object.entries(refSeed)){
  if(config.refreshMode==='snapshot'||!config.source)continue;
  const item=data.refereesByLeague[id];
  tasks.push({id:id+':referees',url:config.source,checkedAt:item?.checkedAt,apply:(html,now)=>{
   if(!/2026\s*\/\s*(?:20)?27/.test(clean(html)))throw Error('Сезон 2026/27 не подтверждён');
   const rows=id==='epl'?parseSoccerbase(html):parseReferees(html,id==='bundesliga');if(rows.length<item.rows.length)throw Error('Уменьшилось покрытие судей');
   for(const row of rows){const old=item.rows.find((r:any)=>r.name===row.name);if(old&&row.n<old.n)throw Error('Уменьшилась выборка судьи')}
   data.refereesByLeague[id]={...item,rows,source:config.source,checkedAt:now,partial:id!=='epl',refreshError:null};
  }});
 }
 return tasks;
}

// Runs the due tasks. Deferred tasks (pass budget, per-origin cap, a host that just
// timed out) keep their schedule and stay due; failures retry 15 min → 6 h, or after
// the source's own back-off when it rate-limited or blocked us.
export async function runRefresh(data:any,tasks:Task[],source:(url:string)=>Promise<string>,now=Date.now()){
 const status:Record<string,BlockStatus>=data.blockStatus=data.blockStatus||{},stamp=new Date(now).toISOString();
 const due=tasks.filter(t=>blockDue(status[t.id],t.checkedAt,now)).sort((a,b)=>(time(status[a.id]?.attemptedAt)||0)-(time(status[b.id]?.attemptedAt)||0));
 const result={due:due.length,ok:0,failed:0,deferred:0};
 await Promise.all(due.map(async task=>{
  try{const html=await source(task.url);task.apply(html,stamp);status[task.id]={attemptedAt:stamp,okAt:stamp,error:null,failures:0,nextAt:new Date(now+BLOCK_INTERVAL).toISOString()};result.ok++}
  catch(e){
   if(e instanceof SourceError&&e.kind==='deferred'){result.deferred++;return}
   const old=status[task.id]||{},failures=(old.failures||0)+1,retry=now+RETRY[Math.min(failures,RETRY.length)-1];
   const until=e instanceof SourceError&&e.until?Math.max(e.until,retry):retry;
   status[task.id]={...old,attemptedAt:stamp,error:String((e as Error)?.message||e),failures,nextAt:new Date(until).toISOString()};result.failed++;
   const [league,key]=task.id.split(':');if(key==='referees'&&data.refereesByLeague?.[league])data.refereesByLeague[league].refreshError=status[task.id].error;
  }
 }));
 data.refreshErrors=blockErrors(status);
 return result;
}
// Errors of blocks whose latest attempt failed, in the 'league: block: message' form data-health reads.
export function blockErrors(status:Record<string,BlockStatus>={}){return Object.entries(status).filter(([,s])=>s.error&&!(time(s.okAt)>=time(s.attemptedAt))).map(([id,s])=>id.replace(':',': ')+': '+s.error)}

// Keep whichever side has the newer attempt for each block when two passes overlap.
export function mergeBlockStatus(a:Record<string,BlockStatus>={},b:Record<string,BlockStatus>={}){
 const out={...a};for(const [id,s] of Object.entries(b))if(!out[id]||(time(s.attemptedAt)||0)>=(time(out[id].attemptedAt)||0))out[id]=s;return out;
}
