// Referee journal built from finished-match summaries (ESPN): one record per match, with the
// referee and both teams' cards and fouls. Pure functions only; I/O lives in referee-journal-refresh.ts.
// Penalties are not taken from ESPN: their field format is not verified in this project, so they stay null.
import {espnOfficials} from './match-officials';
import {teamStats} from './match-analysis';
import {LEAGUES} from './fixtures';

export const JOURNAL_START='2026-06-01';
export const JOURNAL_VERSION=1;
export const journalKey=(league:string)=>`referee-journal/v${JOURNAL_VERSION}/${league}.json`;

type Side={home:number|null,away:number|null,total:number|null};
export type JournalRecord={id:string,league:string,date:string,home:string,away:string,score:string|null,referee:string|null,
 yellow:Side,red:Side,fouls:Side,source:string,checkedAt:string};

const pair=(home:number|null,away:number|null):Side=>({home,away,total:home!==null&&away!==null?home+away:null});
export const nameKey=(s:string)=>(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z]/g,'');

// Returns a record only for a finished match of the expected league since JOURNAL_START.
export function journalRecord(doc:any,league:string,checkedAt:string):JournalRecord|null{
 const c=doc?.header?.competitions?.[0],id=String(doc?.header?.id??c?.id??'');
 if(!/^\d{5,12}$/.test(id)||doc?.header?.league?.slug!==LEAGUES[league]||c?.status?.type?.state!=='post')return null;
 const date=c?.date;if(!Number.isFinite(Date.parse(date))||date.slice(0,10)<JOURNAL_START)return null;
 const h=c.competitors?.find((t:any)=>t.homeAway==='home'),a=c.competitors?.find((t:any)=>t.homeAway==='away');
 if(!h?.team?.id||!a?.team?.id||!h.team.displayName||!a.team.displayName)return null;
 const hs=teamStats(doc,String(h.team.id)),as=teamStats(doc,String(a.team.id));
 const officials=espnOfficials(doc.gameInfo?.officials||c.officials||[]);
 return {id,league,date,home:h.team.displayName,away:a.team.displayName,score:hs.goals!==null&&as.goals!==null?`${hs.goals} - ${as.goals}`:null,
  referee:officials.referee||null,yellow:pair(hs.yellow,as.yellow),red:pair(hs.red,as.red),fouls:pair(hs.fouls,as.fouls),
  source:`https://www.espn.com/soccer/match/_/gameId/${id}`,checkedAt};
}

// One record per match id; a newer check replaces an older one.
export function mergeRecords(...lists:JournalRecord[][]){
 const out=new Map<string,JournalRecord>();
 for(const r of lists.flat())if(r?.id){const old=out.get(r.id);if(!old||Date.parse(r.checkedAt)>=Date.parse(old.checkedAt))out.set(r.id,r)}
 return [...out.values()].sort((a,b)=>b.date.localeCompare(a.date));
}

type Rate={total:number,n:number,perMatch:number|null};
function rate(records:JournalRecord[],key:'yellow'|'red'|'fouls'):Rate{
 const known=records.filter(r=>r[key].total!==null);const total=known.reduce((s,r)=>s+(r[key].total as number),0);
 return {total,n:known.length,perMatch:known.length?total/known.length:null};
}
export function refereeSummary(records:JournalRecord[]){
 const dates=records.map(r=>r.date.slice(0,10)).sort();
 return {n:records.length,yellow:rate(records,'yellow'),red:rate(records,'red'),fouls:rate(records,'fouls'),
  from:dates[0]||null,to:dates.at(-1)||null};
}

// League view: every collected finished match; coverage tells whether it is the whole league.
export function leagueJournal(records:JournalRecord[],coverage:{finished:number,collected:number}){
 const withRef=records.filter(r=>r.referee);const groups=new Map<string,JournalRecord[]>();
 for(const r of withRef){const k=nameKey(r.referee as string);groups.set(k,[...(groups.get(k)||[]),r])}
 const referees=[...groups.values()].map(list=>({name:list[0].referee as string,...refereeSummary(list)})).sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name));
 const complete=coverage.finished>0&&coverage.collected>=coverage.finished;
 return {average:refereeSummary(records),referees,complete,coverage:{...coverage,withReferee:withRef.length,withoutReferee:records.length-withRef.length}};
}

// Exact name match inside one source: ESPN spells a referee identically across its competitions.
export function refereeRecords(records:JournalRecord[],name:string){const k=nameKey(name);return k.length>=5?records.filter(r=>r.referee&&nameKey(r.referee)===k):[]}
