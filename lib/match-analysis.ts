import {venueFields} from './match-location';
export const STAT_KEYS:Record<string,string>={corners:'wonCorners',yellow:'yellowCards',shots:'totalShots',target:'shotsOnTarget',fouls:'foulsCommitted',offsides:'offsides',saves:'saves',red:'redCards',possession:'possessionPct'};
export function stat(stats:any[],key:string):number|null {const s=stats?.find(x=>x.name===key);if(!s)return null;const raw=s.value??s.displayValue;if(raw===null||raw===undefined||raw==='')return null;const n=Number(String(raw).replace('%',''));return Number.isFinite(n)&&n>=0?n:null}
export function teamStats(d:any,id:string){const c=d.header?.competitions?.[0],team=c?.competitors?.find((x:any)=>String(x.team.id)===id),box=d.boxscore?.teams?.find((x:any)=>String(x.team.id)===id);const out:Record<string,number|null>={goals:team?.score!==undefined&&team?.score!==null&&team.score!==''&&Number.isFinite(Number(team.score))?Number(team.score):null};for(const [k,v] of Object.entries(STAT_KEYS))out[k]=stat(box?.statistics,v);return out}
export function compactMatch(d:any){const c=d.header?.competitions?.[0],state=c?.status?.type?.state||'pre',teams=(c?.competitors||[]).map((x:any)=>({id:String(x.team.id),name:x.team.displayName,logo:x.team.logo||x.team.logos?.[0]?.href,side:x.homeAway,score:state==='pre'?null:x.score,stats:state==='pre'?{}:teamStats(d,String(x.team.id))}));return{...venueFields(d.gameInfo?.venue||c?.venue),state,clock:c?.status?.displayClock||null,status:c?.status?.type?.description||null,teams,season:d.header?.season?.name,leagueName:d.header?.league?.name,date:c?.date}}
export const HISTORY_LIMIT=60;
export function historyCandidates(d:any,schedules:Record<string,any>={}){
 const name=d.header?.league?.name,year=d.header?.season?.year,cut=Date.parse(d.header?.competitions?.[0]?.date);
 const teams=d.lastFiveGames?.length?d.lastFiveGames:(d.header?.competitions?.[0]?.competitors||[]).map((c:any)=>({team:c.team,events:[]}));
 return teams.map((t:any)=>{const id=String(t.team.id),scheduled=(schedules[id]?.events||[]).filter((e:any)=>e.league?.name===name&&e.season?.year===year&&e.competitions?.[0]?.status?.type?.state==='post'&&e.competitions[0].competitors?.some((c:any)=>String(c.team.id)===id)).map((e:any)=>({id:String(e.id),gameDate:e.date,leagueName:e.league.name,competitionName:e.season.displayName,opponent:e.competitions[0].competitors.find((c:any)=>String(c.team.id)!==id)?.team}));
 const unique=new Map<string,any>();for(const e of [...(t.events||[]),...scheduled])if(e.leagueName===name&&Date.parse(e.gameDate)<cut&&String(e.competitionName).includes(String(year)+'-'))unique.set(String(e.id),e);
 return {id,name:t.team.displayName,events:[...unique.values()].sort((a:any,b:any)=>Date.parse(b.gameDate)-Date.parse(a.gameDate)).slice(0,HISTORY_LIMIT)};
 });
}
export function buildHistory(d:any,docs:Record<string,any>,schedules:Record<string,any>={}){return historyCandidates(d,schedules).map((t:any)=>({...t,events:t.events.map((e:any)=>{const x=docs[e.id];if(!x||String(x.header?.id??x.header?.competitions?.[0]?.id)!==String(e.id)||!x.header?.competitions?.[0]?.competitors?.some((r:any)=>String(r.team.id)===t.id)||x.header?.competitions?.[0]?.status?.type?.state!=='post'||x.header?.league?.name!==d.header?.league?.name||x.header?.season?.year!==d.header?.season?.year)return null;const opponents=x.header.competitions[0].competitors.filter((r:any)=>String(r.team.id)!==t.id);if(opponents.length!==1)return null;return{id:e.id,date:e.gameDate,leagueName:x.header.league.name,season:x.header.season.name,source:`https://www.espn.com/soccer/match/_/gameId/${e.id}`,opponent:e.opponent?.displayName,homeAway:(()=>{const side=x.header.competitions[0].competitors.find((r:any)=>String(r.team.id)===t.id)?.homeAway;return side==='home'||side==='away'?side:null})(),own:teamStats(x,t.id),against:teamStats(x,String(opponents[0].team.id))}}).filter(Boolean)}))}
export function attackPosition(code:string){if(['F','FW','ST','CF','LF','RF','LW','RW','SS'].includes(code))return 'F';if(['M','MF','AM','AM-L','AM-R','CM','LM','RM','DM'].includes(code))return 'M';return null}
export type PlayerCandidate={
 id:string;name:string;team:string;teamId:string;position:string;starter:boolean|null;
 lineupStatus:'starter'|'bench'|'not-listed'|'unknown';
 appearances:number;n:number;historyN:number;minutes:number|null;minutesN:number;goals:number|null;goalsN:number;
 leagueName:string;season:string;period:{from:string;to:string};source:string|null;
 matches:{id:string;date:string;source:string;minutes:number|null;goals:number|null}[];
};
function samePlayerLeague(a:any,b:any){
 if(a?.id!=null&&b?.id!=null)return String(a.id)===String(b.id);
 if(a?.slug&&b?.slug)return a.slug===b.slug;
 return !!a?.name&&a.name===b?.name;
}
function playerStat(stats:any,key:string):number|null{
 if(!Array.isArray(stats))return null;
 const row=stats.find((s:any)=>s.name===key),raw=row?.value??row?.displayValue;
 if(raw==null||!['number','string'].includes(typeof raw)||String(raw).trim()==='')return null;
 return stat(stats,key);
}
export function playerCandidates(d:any,docs:Record<string,any>):PlayerCandidate[]{
 const competition=d.header?.competitions?.[0],cut=Date.parse(competition?.date),year=d.header?.season?.year;
 if(!Number.isFinite(cut)||year==null||!d.header?.league)return [];
 const currentTeams=[...new Map<string,any>((competition?.competitors||[]).filter((t:any)=>t.team?.id!=null).map((t:any)=>[String(t.team.id),t])).values()].slice(0,2);
 const unique=new Map<string,{id:string;date:string;data:any}>();
 for(const [key,x] of Object.entries(docs)){
  const c=x?.header?.competitions?.[0],id=String(c?.id??x?.header?.id??key),date=c?.date;
  if(!c||c.status?.type?.state!=='post'||!Number.isFinite(Date.parse(date))||Date.parse(date)>=cut||String(x.header?.season?.year)!==String(year)||!samePlayerLeague(d.header.league,x.header?.league))continue;
  unique.set(id,{id,date,data:x});
 }
 const pool:PlayerCandidate[]=currentTeams.flatMap((t:any)=>{
  const teamId=String(t.team.id),currentRoster=d.rosters?.find((r:any)=>String(r.team?.id)===teamId)?.roster||[];
  const current=new Map<string,any>(currentRoster.filter((p:any)=>p.athlete?.id!=null).map((p:any)=>[String(p.athlete.id),p]));
  const lineupConfirmed=currentRoster.some((p:any)=>p.starter===true);
  const history=[...unique.values()].filter(({data:x})=>x.header.competitions[0].competitors?.some((c:any)=>String(c.team?.id)===teamId)).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,HISTORY_LIMIT);
  const candidates=new Map<string,PlayerCandidate>();
  for(const {id:matchId,date,data:x} of history){
   const roster=x.rosters?.find((r:any)=>String(r.team?.id)===teamId)?.roster||[],seen=new Set<string>();
   for(const p of roster){
    if(p.athlete?.id==null||!p.athlete.displayName)continue;
    const id=String(p.athlete.id);if(seen.has(id))continue;seen.add(id);
    // A published match squad is the only basis for excluding a historical player.
    if(lineupConfirmed&&!current.has(id))continue;
    const appearance=playerStat(p.stats,'appearances'),minutes=playerStat(p.stats,'minutesPlayed');
    // Summary rows must describe one match, never a season total. A missing row is not a zero.
    if(appearance!==null&&appearance!==0&&appearance!==1)continue;
    if(appearance===0||!(appearance===1||(minutes!==null&&minutes>0)))continue;
    let candidate=candidates.get(id);
    if(!candidate){
     const now=current.get(id),athlete=now?.athlete||p.athlete;
     const starter=lineupConfirmed&&typeof now?.starter==='boolean'?now.starter:null;
     candidate={id,name:athlete.displayName||p.athlete.displayName,team:t.team.displayName,teamId,position:now?.position?.abbreviation||p.position?.abbreviation||athlete.position?.abbreviation||'',starter,
      lineupStatus:starter===true?'starter':starter===false?'bench':lineupConfirmed?'not-listed':'unknown',
      appearances:0,n:0,historyN:history.length,minutes:null,minutesN:0,goals:null,goalsN:0,
      leagueName:d.header.league.name||d.header.league.slug||String(d.header.league.id),season:d.header.season.name||String(year),
      period:{from:date,to:date},source:athlete.links?.find((l:any)=>l.rel?.includes('playercard'))?.href||null,matches:[]};
     candidates.set(id,candidate);
    }
    const goals=playerStat(p.stats,'totalGoals');candidate.appearances++;candidate.n=candidate.appearances;
    if(minutes!==null){candidate.minutes=(candidate.minutes??0)+minutes;candidate.minutesN++}
    if(goals!==null){candidate.goals=(candidate.goals??0)+goals;candidate.goalsN++}
    candidate.period.from=date;
    candidate.matches.push({id:matchId,date,source:`https://www.espn.com/soccer/match/_/gameId/${matchId}`,minutes,goals});
   }
  }
  return [...candidates.values()];
 });
 // A player appearing for both sides in the history belongs to the most recent observed team.
 const players=new Map<string,PlayerCandidate>();
 for(const p of pool){const previous=players.get(p.id);if(!previous||Date.parse(p.period.to)>Date.parse(previous.period.to))players.set(p.id,p)}
 // Observed playing time first; appearances are the fallback when ESPN omits minutes.
 // This is an evidence ordering, not an estimate of a player's chance to score.
 return currentTeams.flatMap((t:any)=>[...players.values()].filter(p=>p.teamId===String(t.team.id)).sort((a,b)=>(b.minutes??-1)-(a.minutes??-1)||b.appearances-a.appearances||(b.goals??-1)-(a.goals??-1)||a.name.localeCompare(b.name)).slice(0,3));
}

export function compactLineups(d:any){return (d.rosters||[]).filter((t:any)=>(t.roster||[]).some((p:any)=>p.starter===true)).map((t:any)=>({team:t.team.displayName,players:(t.roster||[]).filter((p:any)=>typeof p.starter==='boolean').map((p:any)=>({id:String(p.athlete.id),name:p.athlete.displayName,starter:p.starter}))}))}
