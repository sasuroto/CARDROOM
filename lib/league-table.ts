import {EspnSourceError,type SourceDiagnostic} from './espn-fetch';
import {LEAGUES,espn} from './fixtures';
import {cachedLeagueData,LEAGUE_DATA_TTL} from './league-data-cache';

// ESPN's standing endpoint identifies its competition by uid rather than slug.
const ESPN_LEAGUE_IDS:Record<string,string>={epl:'700',ucl:'775',uel:'776',uecl:'20296',laliga:'740',segunda:'3921',seriea:'730',bundesliga:'720',ligue1:'710',superlig:'3946',primeira:'715',serieb:'3931',championship:'3914',ligue2:'3926',eredivisie:'725',bundesliga2:'3927'};
export type StandingTeam={id:string;name:string;logo:string|null};
export type StandingEntry=StandingTeam&{rank:number|null;played:number|null;won:number|null;drawn:number|null;lost:number|null;goalsFor:number|null;goalsAgainst:number|null;goalDifference:number|null;points:number|null;form:null;note:string|null};
export type LeagueTable={league:string;season:number;seasonLabel:string;groups:{name:string;sourceName:string;entries:StandingEntry[]}[];teams:StandingTeam[];checkedAt:string|null;source:string;stale?:boolean;error?:string;attemptedAt?:string;diagnostic?:SourceDiagnostic};
export function sourceNumber(raw:unknown,negative=false):number|null{
 if((typeof raw!=='number'&&typeof raw!=='string')||String(raw).trim()==='')return null;
 const value=Number(raw);return Number.isFinite(value)&&(negative||value>=0)?value:null;
}
function value(stats:any[],key:string,negative=false){const item=stats.find(s=>s?.name===key);return sourceNumber(item?.value??item?.displayValue,negative)}
export function tableSource(league:string){return `https://www.espn.com/soccer/table/_/league/${LEAGUES[league]}`}
export function emptyLeagueTable(league:string,season:number):LeagueTable{return{league,season,seasonLabel:`${season}/${String(season+1).slice(-2)}`,groups:[],teams:[],checkedAt:null,source:tableSource(league)}}
export function parseLeagueTable(doc:any,league:string,season:number,checkedAt=new Date().toISOString()):LeagueTable{
 if(!doc||typeof doc!=='object'||typeof doc.uid!=='string')throw new EspnSourceError('invalid_schema','Некорректная таблица');
 const identity=doc.uid.split('~').find((part:string)=>part.startsWith('l:'));
 if(!identity||!/^l:\d+$/.test(identity))throw new EspnSourceError('invalid_schema','Некорректный турнир');
 if(!LEAGUES[league]||identity!==`l:${ESPN_LEAGUE_IDS[league]}`)throw new EspnSourceError('wrong_league','Другой турнир');
 const result=emptyLeagueTable(league,season),teams=new Map<string,StandingTeam>();
 function visit(node:any){
  if(!node||typeof node!=='object')throw new EspnSourceError('invalid_schema','Некорректная таблица');
  if(node.standings){
   const table=node.standings;if(!/^20\d{2}$/.test(String(table.season))||!Array.isArray(table.entries))throw new EspnSourceError('invalid_schema','Неверная таблица');
   if(Number(table.season)!==season)throw new EspnSourceError('wrong_season','Другой сезон');
   const seen=new Set<string>(),entries:StandingEntry[]=table.entries.map((row:any)=>{
    if(!row||typeof row!=='object')throw new EspnSourceError('invalid_schema','Некорректная команда');
    const id=String(row.team?.id??''),name=row.team?.displayName,stats=row.stats;
    if(!/^\d{1,10}$/.test(id)||typeof name!=='string'||!name||!Array.isArray(stats)||seen.has(id))throw new EspnSourceError('invalid_schema','Некорректная команда');seen.add(id);
    const entry:StandingEntry={id,name,logo:row.team.logo||row.team.logos?.[0]?.href||null,rank:value(stats,'rank'),played:value(stats,'gamesPlayed'),won:value(stats,'wins'),drawn:value(stats,'ties'),lost:value(stats,'losses'),goalsFor:value(stats,'pointsFor'),goalsAgainst:value(stats,'pointsAgainst'),goalDifference:value(stats,'pointDifferential',true),points:value(stats,'points',true),form:null,note:row.note?.description||null};
    if([entry.played,entry.won,entry.drawn,entry.lost].every(v=>v!==null)&&entry.played!==entry.won!+entry.drawn!+entry.lost!)throw new EspnSourceError('invalid_schema','Несогласованное число матчей');
    if([entry.goalsFor,entry.goalsAgainst,entry.goalDifference].every(v=>v!==null)&&entry.goalDifference!==entry.goalsFor!-entry.goalsAgainst!)throw new EspnSourceError('invalid_schema','Несогласованная разность голов');
    // Points are taken verbatim: deductions and competition rules are not inferred.
    teams.set(id,{id,name,logo:entry.logo});return entry;
   });
   const sourceName=String(node.name||table.displayName||doc.name||'Таблица');
   result.groups.push({name:sourceName==='League Phase'?'Общий этап':sourceName,sourceName,entries});
  }
  if(Array.isArray(node.children))node.children.forEach(visit);
 }
 visit(doc);if(!result.groups.length&&!Array.isArray(doc.children))throw new EspnSourceError('invalid_schema','Некорректная таблица');
 result.teams=[...teams.values()];result.checkedAt=checkedAt;return result;
}
export function loadLeagueTable(bucket:R2Bucket|undefined,league:string,season:number){return cachedLeagueData(bucket,`league-table/v1/${league}/${season}.json`,LEAGUE_DATA_TTL,async()=>parseLeagueTable(await espn(`https://site.web.api.espn.com/apis/v2/sports/soccer/${LEAGUES[league]}/standings?season=${season}`,bucket),league,season),()=>emptyLeagueTable(league,season))}
