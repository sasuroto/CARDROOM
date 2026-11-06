import type {AdvanceRow} from './advance-parsers';
import seed from './seed.json';
const PL='https://sdp-prem-prod.premier-league-prod.pulselive.com/api';
type Read=(url:string)=>Promise<string>;
export async function loadPL(read:Read){
 // Use the official API directly: the public HTML shell intermittently returns 503.
 const season=seed.leagues.find(l=>l.id==='epl')?.season.split('/')[0];
 if(!season||Date.now()<Date.parse(`${season}-07-01`)||Date.now()>=Date.parse(`${Number(season)+1}-07-01`))throw Error('Premier League: configured season needs verification');
 const matches:any[]=[],seen=new Set<string>();let pageCursor:string|null=null;
 for(let page=0;page<4;page++){
  const data=JSON.parse(await read(`${PL}/v2/matches?competition=8&season=${season}&_limit=100${pageCursor?'&_next='+encodeURIComponent(pageCursor):''}`));
  if(!Array.isArray(data.data)||data.data.some((m:any)=>String(m.competitionId)!=='8'||String(m.season)!==season))throw Error('Premier League: calendar competition/season mismatch');
  matches.push(...data.data);
  pageCursor=data.pagination?._next||null;if(!pageCursor)break;
  if(typeof pageCursor!=='string'||seen.has(pageCursor))throw Error('Premier League: invalid pagination');seen.add(pageCursor);
 }
 if(pageCursor)throw Error('Premier League: incomplete calendar');
 const rows:AdvanceRow[]=[],errors:string[]=[],now=Date.now();
 const today=Math.floor(now/86400000)*86400000;
 const recent=matches.filter(m=>/^\d{4}-\d{2}-\d{2} /.test(m.kickoff||'')&&Date.parse(m.kickoff.slice(0,10))>=today-2*86400000&&Date.parse(m.kickoff.slice(0,10))<=today+8*86400000).sort((a,b)=>Math.abs(Date.parse(a.kickoff.slice(0,10))-today)-Math.abs(Date.parse(b.kickoff.slice(0,10))-today)).slice(0,24);
 let cursor=0;
 await Promise.all(Array.from({length:3},async()=>{while(cursor<recent.length){const m=recent[cursor++];try{
  if(!/^\d+$/.test(String(m.matchId)))continue;
  const source=`${PL}/v1/matches/${m.matchId}/officials`,d=JSON.parse(await read(source));
  if(String(d.matchId)!==String(m.matchId)||!Array.isArray(d.matchOfficials))throw Error('Premier League: appointment identity mismatch');
  const name=(type:string)=>d.matchOfficials.find((o:any)=>o.type===type)?.official?.name||null;
  const referee=name('Referee');if(!referee)continue;
  rows.push({league:'epl',day:m.kickoff.slice(0,10),home:m.homeTeam.name,away:m.awayTeam.name,referee,assistants:[name('Assistant Referee#1'),name('Assistant Referee#2')].filter(Boolean),fourthOfficial:name('Fourth official'),var:name('Video Assistant Referee'),avar:name('Assistant VAR Official'),source});
 }catch(e){errors.push(String(e));if(/HTTP (403|429)|cooldown/.test(String(e)))cursor=recent.length}}}));
 if(!rows.length)throw Error(errors.join('; ')||'Premier League: appointments not yet published');return {rows,sources:[`${PL}/v2/matches?competition=8&season=${season}&_limit=100`],errors};
}
export async function loadPortugal(read:Read){
 const seasons=JSON.parse(await read('https://www.ligaportugal.pt/api/v3/seasons'));
 const current=Array.isArray(seasons)?seasons.filter((s:any)=>s.is_current_season===true):[];
 if(current.length!==1||!/^\d{8}$/.test(String(current[0].id)))throw Error('Liga Portugal: current season not confirmed');
 const season=String(current[0].id);
 const base='https://www.ligaportugal.pt/api/v1/competition',query=`competition=ligaportugalbetclic&season=${season}`;
 const rounds=JSON.parse(await read(`${base}/season/rounds?${query}`));
 if(!Array.isArray(rounds))throw Error('Liga Portugal: round list format changed');
 const selected=rounds.filter((r:any)=>r.is_current_round||(Date.parse(r.initial_date)<=Date.now()+8*86400000&&Date.parse(r.final_date)>=Date.now()-2*86400000)).sort((a:any,b:any)=>Number(!!b.is_current_round)-Number(!!a.is_current_round)).slice(0,3);
 const rows:AdvanceRow[]=[],sources:string[]=[];
 for(const r of selected){
  const round=r.round_number;
  if(!/^\d{1,2}$/.test(String(round)))throw Error('Liga Portugal: round identity missing');
  const source=`${base}/round/${round}/nominations?${query}`,data=JSON.parse(await read(source));sources.push(source);
  if(!Array.isArray(data))throw Error('Liga Portugal: appointment list format changed');
  for(const item of data){const m=item.fixture||item.match||item;
   if(String(m.seasonCode)!==season||m.competitionName!=='ligaportugalbetclic'||Number(m.matchweekNumber)!==Number(round)||!/^\d{4}-\d{2}-\d{2}/.test(m.matchDate||'')||!item.refereeName)continue;
   rows.push({league:'primeira',day:m.matchDate.slice(0,10),home:m.homeTeam.name,away:m.awayTeam.name,referee:item.refereeName,assistants:[item.refereeAux1Name,item.refereeAux2Name].filter(Boolean),fourthOfficial:item.refereeFourthName||null,var:item.refereeVarName||null,avar:item.refereeAVarName||null,source});
  }
 }
 if(!rows.length)throw Error('Liga Portugal: no current appointments');return {rows,sources,errors:[]};
}
