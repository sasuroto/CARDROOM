import seed from './seed.json';
export type Data = typeof seed;
export const initialData:Data=seed;
export function clean(s:string){return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}
export function tableRows(html:string){return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(m=>[...m[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>clean(c[1]))));}
const numericCell=(v:string|undefined)=>typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v.trim());
export function parseTeams(html:string){
 const tables=tableRows(html);const all=tables.find(t=>t.some(r=>(r.includes('TG')||r.some(c=>/Matches Played/.test(c)))&&(r.includes('YF')||r.some(c=>/Avg Cards Received/.test(c)))));
 if(!all)throw new Error('Таблица ЖК не найдена');
 const header=all.find(r=>r.includes('TG')||r.some(c=>/Matches Played/.test(c)))!;
 const idx=(re:RegExp)=>header.findIndex(c=>re.test(c));
 const ni=idx(/^TG$|Matches Played/),yi=idx(/^YF$|Avg Cards Received/),oi=idx(/^YA$|Avg Opp/),pi=idx(/^O4\.5$|^Over 4\.5/),ti=idx(/^Team$/);
 if([ni,yi,oi,pi,ti].some(n=>n<0))throw new Error('Неизвестный формат ЖК');
 const teams=all.filter(r=>/^\d+$/.test(r[ni]||'')&&r[ti]&&[yi,oi,pi].every(i=>numericCell(r[i]))).map(r=>({name:r[ti],n:+r[ni],yellow:+r[yi],opp:+r[oi],over45:+r[pi],home:null as number|null,away:null as number|null})).filter(r=>r.n>0&&r.n<100&&r.yellow>=0&&r.yellow<=15&&r.opp>=0&&r.opp<=15&&r.over45>=0&&r.over45<=100);
 for(const mode of ['home','away'] as const){const h=mode==='home'?'YFH':'YFA';const t=tables.find(t=>t.some(r=>r.includes(h)&&r.includes('Team')));if(t){const head=t.find(r=>r.includes(h))!;for(const r of t){const team=teams.find(s=>s.name===r[head.indexOf('Team')]);if(team&&numericCell(r[head.indexOf(h)]))team[mode]=+r[head.indexOf(h)];}}}
 if(!teams.length)throw new Error('Пустая выборка');return teams;
}
export function parseCards(html:string){const t=clean(html);const m=t.match(/average cards per game in the .{1,100}? is ([\d.]+) cards\.\s*([\d.]+) cards for the home team and ([\d.]+) for the away team\.\s*In total, there were ([\d,]+) cards in ([\d,]+) matches/);if(!m)throw new Error('Сводка карточек не найдена');const avg=+m[1],home=+m[2],away=+m[3],n=+m[5].replaceAll(',','');if(!n||avg>15||Math.abs(home+away-avg)>.03)throw new Error('Несогласованная сводка');return {avg,home,away,n};}
export function parseOverview(html:string){const t=clean(html);const get=(re:RegExp)=>{const m=t.match(re);return m?+m[1]:null};const goals=get(/([\d.]+)\s*Goals \/ Match/),btts=get(/(\d+)%\s*Both Teams Scored/),shots=get(/Shots Per Match\s*([\d.]+)/),fouls=get(/Fouls Per Match\s*([\d.]+)/);if(goals===null||goals>10||fouls===null||fouls>70)throw new Error('Обзор не распознан');return{goals,btts,shots,fouls};}
export function sameSeason(html:string,season:string){const t=clean(html);return t.includes(season)||t.includes(season.replace('/','/20'));}
