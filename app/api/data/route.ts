import {withDataHealth} from '../../../lib/data-health';
import {mergeDataSnapshot} from '../../../lib/data-snapshot';
import {mergeRefereeUpdates} from '../../../lib/referee-updates';
import {readCache,writeCache} from '../../../lib/cache';
import {createSourceReader} from '../../../lib/source-fetch';
import refSeed from '../../../lib/referees.json';
import {parseReferees,parseSoccerbase} from '../../../lib/referee-parser';
import {env} from 'cloudflare:workers';
import {initialData,clean,parseCards,parseOverview,parseTeams,tableRows} from '../../../lib/data';
export const dynamic='force-dynamic';
const KEY='cardroom/data-v1.json',TTL=6*60*60*1000;
export async function GET(){
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
 let data:any=mergeDataSnapshot(initialData,await readCache(bucket,KEY));
 const source=createSourceReader(bucket);
 data.refereesByLeague={...structuredClone(refSeed),...(data.refereesByLeague||{})};
 if(data.refereesByLeague.epl.source!==refSeed.epl.source)data.refereesByLeague.epl=structuredClone(refSeed.epl);
 if(data.lastAttempt&&Date.now()-Date.parse(data.lastAttempt)<TTL)return Response.json(withDataHealth(await mergeRefereeUpdates(data,bucket)),{headers:{'Cache-Control':'no-store'}});
 const now=new Date().toISOString();data.lastAttempt=now;data.parserVersion=6;let successes=0;const errors:string[]=[];
 await Promise.allSettled(data.leagues.map(async(l:any)=>{
  const ensure=(html:string)=>{const txt=clean(html);if(!txt.includes(l.season)&&!txt.includes(l.season.replace('/','/20')))throw new Error('Сезон не подтверждён')};
  await Promise.allSettled([
   (async()=>{try{const html=await source(l.cards.source);ensure(html);const parsed=parseCards(html);if(parsed.n<l.cards.n)throw new Error('Уменьшилась выборка');l.cards={...l.cards,...parsed,checkedAt:now};successes++}catch(e){errors.push(l.id+': cards: '+String(e))}})(),
   (async()=>{try{const html=await source(l.overview.source);ensure(html);l.overview={...l.overview,...parseOverview(html),checkedAt:now};successes++}catch(e){errors.push(l.id+': overview: '+String(e))}})(),
   (async()=>{if(l.id==='segunda'||!l.teamSource||l.teamRefreshMode==='snapshot')return;try{const html=await source(l.teamSource);ensure(html);const teams=parseTeams(html);if(teams.length<l.teams.length)throw new Error('Неполная выдача');for(const t of teams){const old=l.teams.find((x:any)=>x.name===t.name);if(old&&t.n<old.n)throw new Error('Устаревшая выборка')}
    l.teams=teams;l.teamCheckedAt=now;const size=['bundesliga','ligue1','superlig','primeira'].includes(l.id)?18:l.id==='ucl'?36:20;l.partial=teams.length<size;
    if(!l.partial&&l.id!=='ucl'){const games=teams.reduce((s,t)=>s+t.n,0)/2;const own=teams.reduce((s,t)=>s+t.n*t.yellow,0);const opp=teams.reduce((s,t)=>s+t.n*t.opp,0);if(Math.abs(own-opp)/Math.max(own,1)<.02)l.yellowSummary={n:games,avg:+(own/games).toFixed(2),derived:true,source:l.teamSource,checkedAt:now};l.teamNote='Полная таблица источника; сезон '+l.season;}
    successes++}catch(e){errors.push(l.id+': yellow: '+String(e))}})(),
   (async()=>{if(!l.cornerSource)return;try{const html=await source(l.cornerSource);ensure(html);const rows=tableRows(html);const table=rows.find(t=>t.some(r=>r.includes('CF')&&r.includes('TG')&&r.includes('Team')));if(!table)throw new Error('Таблица не найдена');const head=table.find(r=>r.includes('CF'))!;const rows2=table.filter(r=>/^\d+$/.test(r[head.indexOf('TG')]||'')&&['CF','CA','O9.5'].every(k=>/^\d+(?:\.\d+)?$/.test(r[head.indexOf(k)]||''))).map(r=>({name:r[head.indexOf('Team')],n:+r[head.indexOf('TG')],for:+r[head.indexOf('CF')],against:+r[head.indexOf('CA')],over95:+r[head.indexOf('O9.5')]})).filter(r=>r.n>0&&r.for>=0&&r.for<25&&r.against>=0&&r.against<25);if(!rows2.length||rows2.length<l.corners.length)throw new Error('Неполная выдача');if(rows2.some(r=>{const old=l.corners.find((x:any)=>x.name===r.name);return old&&r.n<old.n}))throw Error('Устаревшая выборка угловых');l.corners=rows2;l.cornerCheckedAt=now;successes++}catch(e){errors.push(l.id+': corners: '+String(e))}})()
  ]);
 }));

 try{const item=data.leagues.find((l:any)=>l.id==='segunda');const html=await source(item.teamSource);const tables=tableRows(html);for(const table of tables){const row=table.find(r=>r[0]==='Current season'&&r[1]==='Spain'&&r[2]==='LaLiga2');if(row){const n=+row[3],avg=+row[4],home=+row[5],away=+row[6];if(n>=item.yellowSummary.n&&avg>=0&&avg<15&&Math.abs(home+away-avg)<.04){item.yellowSummary={n,avg,home,away,over35:+row[9],over45:+row[11],over55:+row[13],source:item.teamSource,checkedAt:now};successes++}break}}}catch(e){errors.push('segunda: yellow-summary: '+String(e))}
 // Fixed-source ingestion only. The public API accepts no uploaded data or target URL.
 try{const html=await source(data.refSource);const tables=tableRows(html);const table=tables.find(t=>t.some(r=>r.includes('Referee')&&r.some(c=>c.includes('Avg Match Cards'))));if(table){const h=table.find(r=>r.includes('Referee'))!;const rows=table.filter(r=>r[h.indexOf('Period')]==='Current season'&&r[h.indexOf('League')]==='LaLiga');const updated=rows.slice(0,10).map(r=>({name:r[h.indexOf('Referee')],league:'La Liga',n:+r[h.findIndex(c=>c.includes('Matches Refereed'))],yellow:+r[h.findIndex(c=>c.includes('Avg Match Cards'))],over45:+r[h.findIndex(c=>c.includes('Over 4.5'))],careerN:null,careerYellow:null}));if(updated.length>=data.referees.length&&updated.every(r=>r.n>0&&r.yellow>=0&&r.yellow<15)){data.referees=updated;data.refCheckedAt=now;successes++}}}catch(e){errors.push('referees: '+String(e))}
 await Promise.allSettled(Object.entries(refSeed as Record<string,any>).map(async([id,config])=>{
  if(config.refreshMode==='snapshot'||!config.source)return;
  const item=data.refereesByLeague[id];
  try{const html=await source(config.source);if(!/2026\s*\/\s*(?:20)?27/.test(clean(html)))throw Error('Сезон 2026/27 не подтверждён');
   const rows=id==='epl'?parseSoccerbase(html):parseReferees(html,id==='bundesliga');if(rows.length<item.rows.length)throw Error('Уменьшилось покрытие судей');
   for(const row of rows){const old=item.rows.find((r:any)=>r.name===row.name);if(old&&row.n<old.n)throw Error('Уменьшилась выборка судьи')}
   data.refereesByLeague[id]={...item,rows,source:config.source,checkedAt:now,partial:id!=='epl',refreshError:null};successes++;
  }catch(e){item.refreshError=String(e);errors.push(id+': referees: '+String(e))}
 }));
 data.refreshStatus=successes?(errors.length?'partial':'updated'):'sources-unavailable';data.updatedFields=successes;data.refreshErrors=errors;
 await writeCache(bucket,KEY,data);
 return Response.json(withDataHealth(await mergeRefereeUpdates(data,bucket)),{headers:{'Cache-Control':'no-store'}});
}
