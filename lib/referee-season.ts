import {clean} from './data';
import {parseReferees,parseSoccerbase} from './referee-parser';
const SEASON='2026/27';
// Only captions/header cells INSIDE the table whose rows we parse are evidence.
// Navigation, dropdown options, page headings and neighbouring tables never qualify.
const seasons=(text:string)=>[...text.matchAll(/\b(20\d{2})\s*\/\s*((?:20)?\d{2})\b/g)].map(m=>m[1]+'/'+m[2].slice(-2));
export function confirmedRefereeSeason(group:any):boolean{
 const e=group?.seasonEvidence;
 return group?.seasonConfirmed===true&&e?.version===1&&e.method==='table-header'&&e.season===SEASON&&
  e.source===group.source&&typeof e.source==='string'&&e.source.length>0&&e.checkedAt===group.checkedAt&&
  Number.isFinite(Date.parse(e.checkedAt))&&Array.isArray(e.markers)&&e.markers.length>0&&
  e.markers.every((s:unknown)=>typeof s==='string'&&seasons(s).length>0&&seasons(s).every(v=>v===SEASON));
}
export function normalizeRefereeSeason(group:any){
 if(!group)return group;
 return {...group,seasonConfirmed:confirmedRefereeSeason(group),periodLabel:confirmedRefereeSeason(group)?'Сезон '+SEASON:'Период источника не подтверждён'};
}
export function parseSeasonalReferees(html:string,league:string,source:string,checkedAt:string,limit=18){
 const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m=>m[0]);
 const candidates=tables.flatMap(table=>{try{
  const rows=league==='epl'?parseSoccerbase(table):parseReferees(table,league==='bundesliga',limit);
  return [{table,rows}];
 }catch{return []}});
 if(candidates.length!==1)throw Error('Таблица статистики судей не определена однозначно');
 const {table,rows}=candidates[0];
 const headers=[...table.matchAll(/<(?:caption|th)\b[^>]*>([\s\S]*?)<\/(?:caption|th)>/gi)].map(m=>clean(m[1]));
 const markers=headers.filter(h=>seasons(h).length>0),all=seasons(clean(table));
 if(!markers.length||!all.length||all.some(s=>s!==SEASON))throw Error('Сезон 2026/27 не подтверждён внутри выбранной таблицы');
 return {rows,seasonConfirmed:true,periodLabel:'Сезон '+SEASON,seasonEvidence:{version:1,method:'table-header',season:SEASON,source,checkedAt,markers}};
}
