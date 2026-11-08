import {LEAGUES,espn} from './fixtures';
import {cachedLeagueData,LEAGUE_DATA_TTL,LeagueDataError} from './league-data-cache';

// ESPN's standing endpoint identifies its competition by uid rather than slug.
const ESPN_LEAGUE_IDS:Record<string,string>={epl:'700',ucl:'775',uel:'776',uecl:'20296',laliga:'740',segunda:'3921',seriea:'730',bundesliga:'720',ligue1:'710',superlig:'3946',primeira:'715',serieb:'3931',championship:'3914',ligue2:'3926',eredivisie:'725',bundesliga2:'3927'};
export type StandingTeam={id:string;name:string;logo:string|null};
export type StandingEntry=StandingTeam&{rank:number|null;played:number|null;won:number|null;drawn:number|null;lost:number|null;goalsFor:number|null;goalsAgainst:number|null;goalDifference:number|null;points:number|null;form:null;note:string|null};
export type LeagueTable={league:string;season:number;seasonLabel:string;groups:{name:string;sourceName:string;entries:StandingEntry[]}[];teams:StandingTeam[];checkedAt:string|null;source:string;stale?:boolean;error?:string;attemptedAt?:string;nextCheckAt?:string;coverage?:{teams:number;expectedTeams:number|null;complete:boolean|null}};
export function sourceNumber(raw:unknown,negative=false):number|null{
 if((typeof raw!=='number'&&typeof raw!=='string')||String(raw).trim()==='')return null;
 const value=Number(raw);return Number.isFinite(value)&&(negative||value>=0)?value:null;
}
function value(stats:any[],key:string,negative=false){const item=stats.find(s=>s?.name===key);return sourceNumber(item?.value??item?.displayValue,negative)}
export function tableSource(league:string){return `https://www.espn.com/soccer/table/_/league/${LEAGUES[league]}`}
export function emptyLeagueTable(league:string,season:number):LeagueTable{return{league,season,seasonLabel:`${season}/${String(season+1).slice(-2)}`,groups:[],teams:[],checkedAt:null,source:tableSource(league)}}
export function parseLeagueTable(doc:any,league:string,season:number,checkedAt=new Date().toISOString()):LeagueTable{
 if(!LEAGUES[league]||String(doc?.uid||'').split('~').find((part:string)=>part.startsWith('l:'))!==`l:${ESPN_LEAGUE_IDS[league]}`)throw new LeagueDataError('invalid');
 const result=emptyLeagueTable(league,season),teams=new Map<string,StandingTeam>();
 function visit(node:any){
  if(node.standings){
   const table=node.standings;if(Number(table.season)!==season||!Array.isArray(table.entries))throw new LeagueDataError('invalid');
   const seen=new Set<string>(),entries:StandingEntry[]=table.entries.map((row:any)=>{
    const id=String(row.team?.id??''),name=row.team?.displayName,stats=row.stats;
    if(!/^\d{1,10}$/.test(id)||typeof name!=='string'||!name||!Array.isArray(stats)||seen.has(id))throw new LeagueDataError('invalid');seen.add(id);
    const entry:StandingEntry={id,name,logo:row.team.logo||row.team.logos?.[0]?.href||null,rank:value(stats,'rank'),played:value(stats,'gamesPlayed'),won:value(stats,'wins'),drawn:value(stats,'ties'),lost:value(stats,'losses'),goalsFor:value(stats,'pointsFor'),goalsAgainst:value(stats,'pointsAgainst'),goalDifference:value(stats,'pointDifferential',true),points:value(stats,'points',true),form:null,note:row.note?.description||null};
    if([entry.played,entry.won,entry.drawn,entry.lost].every(v=>v!==null)&&entry.played!==entry.won!+entry.drawn!+entry.lost!)throw new LeagueDataError('invalid');
    if([entry.goalsFor,entry.goalsAgainst,entry.goalDifference].every(v=>v!==null)&&entry.goalDifference!==entry.goalsFor!-entry.goalsAgainst!)throw new LeagueDataError('invalid');
    // Points are taken verbatim: deductions and competition rules are not inferred.
    teams.set(id,{id,name,logo:entry.logo});return entry;
   });
   const sourceName=String(node.name||table.displayName||doc.name||'Таблица');
   result.groups.push({name:sourceName==='League Phase'?'Общий этап':sourceName,sourceName,entries});
  }
  if(Array.isArray(node.children))node.children.forEach(visit);
 }
 visit(doc);if(!result.groups.length||result.groups.some(group=>!group.entries.length))throw new LeagueDataError('empty');
 result.teams=[...teams.values()];result.checkedAt=checkedAt;return result;
}
// Counts are the configured 2026/27 competition format, not inferred from a
// provider's truncated response. Older/future formats remain explicitly unknown.
const EXPECTED_2026:Record<string,number>={epl:20,ucl:36,uel:36,uecl:36,laliga:20,segunda:22,seriea:20,bundesliga:18,ligue1:18,superlig:18,primeira:18,serieb:20,championship:24,ligue2:18,eredivisie:18,bundesliga2:18};
const METRICS=['rank','played','won','drawn','lost','goalsFor','goalsAgainst','goalDifference','points'] as const;
export function validateLeagueTable(value:LeagueTable,league:string,season:number,previous?:LeagueTable):LeagueTable{
 const stamp=typeof value?.checkedAt==='string'?Date.parse(value.checkedAt):NaN;
 if(value?.league!==league||value?.season!==season||value?.source!==tableSource(league)||!Number.isFinite(stamp)||stamp>Date.now()+60000||!Array.isArray(value.groups)||!Array.isArray(value.teams))throw new LeagueDataError('invalid');
 if(!value.groups.length||value.groups.some(group=>!Array.isArray(group?.entries)||!group.entries.length))throw new LeagueDataError('empty');
 const entries=value.groups.flatMap(group=>group.entries),ids=new Set(entries.map(entry=>entry?.id)),expectedTeams=season===2026?EXPECTED_2026[league]??null:null;
 if(!ids.size)throw new LeagueDataError('empty');
 if(ids.size!==entries.length||value.teams.length!==ids.size||new Set(value.teams.map(team=>team?.id)).size!==ids.size||value.teams.some(team=>!ids.has(team?.id)))throw new LeagueDataError('invalid');
 if(expectedTeams!==null&&ids.size!==expectedTeams)throw new LeagueDataError('incomplete');
 for(const row of entries){
  if(typeof row?.id!=='string'||!/^\d{1,10}$/.test(row.id)||typeof row.name!=='string'||!row.name.trim())throw new LeagueDataError('invalid');
  if(METRICS.some(key=>typeof row[key]!=='number'||!Number.isSafeInteger(row[key])))throw new LeagueDataError('incomplete');
  if(METRICS.some(key=>key!=='points'&&key!=='goalDifference'&&row[key]!<0)||row.rank!<1||row.rank!>entries.length||row.played!==row.won!+row.drawn!+row.lost!||row.goalDifference!==row.goalsFor!-row.goalsAgainst!)throw new LeagueDataError('invalid');
 }
 if(previous){
  const before=previous.groups.flatMap(group=>group.entries),byId=new Map(entries.map(row=>[row.id,row]));
  // A same-season source regression cannot erase teams, observed columns or games.
  if(stamp<Date.parse(previous.checkedAt||'')||before.some(row=>!byId.has(row.id)||byId.get(row.id)!.played!<row.played!))throw new LeagueDataError('regression');
 }
 return {league:value.league,season:value.season,seasonLabel:value.seasonLabel,groups:value.groups,teams:value.teams,checkedAt:value.checkedAt,source:value.source,coverage:{teams:ids.size,expectedTeams,complete:expectedTeams===null?null:true}};
}
export function loadLeagueTable(bucket:R2Bucket|undefined,league:string,season:number){return cachedLeagueData(bucket,`league-table/v1/${league}/${season}.json`,LEAGUE_DATA_TTL,async()=>parseLeagueTable(await espn(`https://site.web.api.espn.com/apis/v2/sports/soccer/${LEAGUES[league]}/standings?season=${season}`,bucket),league,season),()=>emptyLeagueTable(league,season),{validate:(value,previous)=>validateLeagueTable(value,league,season,previous)})}
