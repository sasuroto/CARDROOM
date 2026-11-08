import type {PeriodEvidence} from './period-evidence-types';
export type {PeriodEvidence} from './period-evidence-types';
import {LEAGUES,espn} from './fixtures';
import {readCache,writeCache} from './cache';

const CACHE_TTL=60000;
export const PERIOD_EVIDENCE_MAX_GAP=120000;
const finalNames=['STATUS_FULL_TIME','STATUS_FINAL'];
const forbidden=/extra|penalt|shootout|дополн|пенальти/i;
const id=(value:unknown)=>typeof value==='string'&&/^\d+$/.test(value)?value:typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?String(value):null;
const score=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=999?value:typeof value==='string'&&/^\d{1,3}$/.test(value)?Number(value):null;
const time=(value:unknown)=>typeof value==='string'?Date.parse(value):NaN;
type Status={period?:unknown;type?:{state?:unknown;name?:unknown;completed?:unknown;detail?:unknown;shortDetail?:unknown;description?:unknown}};
type Competitor={homeAway?:unknown;team?:{id?:unknown};score?:unknown};
type Competition={id?:unknown;date?:unknown;status?:Status;competitors?:Competitor[]};
type Summary={header?:{id?:unknown;league?:{slug?:unknown};competitions?:Competition[]}};
type Scoreboard={leagues?:{slug?:unknown}[];events?:{id?:unknown;date?:unknown;status?:Status;competitions?:Competition[]}[]};
function regularStatus(status:Status|undefined){
 const t=status?.type;
 return t?.state==='post'&&t.completed===true&&typeof t.name==='string'&&finalNames.includes(t.name)&&![t.detail,t.shortDetail,t.description].some(v=>typeof v==='string'&&forbidden.test(v));
}
function sides(c:Competition){
 const teams=c?.competitors;if(!Array.isArray(teams)||teams.length!==2)return null;
 const h=teams.filter(t=>t?.homeAway==='home'),a=teams.filter(t=>t?.homeAway==='away');if(h.length!==1||a.length!==1)return null;
 const homeId=id(h[0].team?.id),awayId=id(a[0].team?.id),homeScore=score(h[0].score),awayScore=score(a[0].score);
 return homeId&&awayId&&homeId!==awayId&&homeScore!==null&&awayScore!==null?{homeId,awayId,homeScore,awayScore}:null;
}
function summaryFacts(summary:Summary,eventId:string,league:string){
 const h=summary?.header,c=h?.competitions;
 if(!LEAGUES[league]||h?.league?.slug!==LEAGUES[league]||!Array.isArray(c)||c.length!==1)return null;
 const match=c[0];
 if(id(h?.id)!==eventId||id(match?.id)!==eventId||!Number.isFinite(time(match?.date))||!regularStatus(match?.status)||match?.status?.period!=null)return null;
 const teams=sides(match);return teams?{id:eventId,league,kickoff:new Date(time(match?.date)).toISOString(),...teams,statusName:match.status!.type!.name as string}:null;
}
export function corroboratePeriod(summary:Summary,board:Scoreboard,context:{id:string;league:string;summaryAt:string;scoreboardAt:string},now=Date.now()):PeriodEvidence|null{
 const facts=summaryFacts(summary,context.id,context.league),summaryTime=time(context.summaryAt),boardTime=time(context.scoreboardAt);
 if(!facts||![summaryTime,boardTime].every(t=>Number.isFinite(t)&&t<=now&&now-t<=PERIOD_EVIDENCE_MAX_GAP)||Math.abs(summaryTime-boardTime)>PERIOD_EVIDENCE_MAX_GAP)return null;
 if(time(facts.kickoff)>Math.min(summaryTime,boardTime)||!Array.isArray(board?.leagues)||board.leagues.length!==1||board.leagues[0]?.slug!==LEAGUES[context.league]||!Array.isArray(board.events))return null;
 const matches=board.events.filter(e=>id(e?.id)===context.id);if(matches.length!==1)return null;
 const event=matches[0],competitions=event.competitions;
 if(!Array.isArray(competitions)||competitions.length!==1)return null;
 const c=competitions[0],teams=sides(c);
 if(id(c?.id)!==context.id||time(event.date)!==time(facts.kickoff)||(c.date!==undefined&&time(c.date)!==time(facts.kickoff))||!teams||Object.entries(teams).some(([k,v])=>facts[k as keyof typeof teams]!==v))return null;
 const statuses=[event.status,c.status].filter((s):s is Status=>s!==undefined);
 if(!statuses.length||statuses.some(s=>!regularStatus(s)||s.period!==2||s.type?.name!==facts.statusName))return null;
 const date=facts.kickoff.slice(0,10).replaceAll('-',''),endpoint=`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[context.league]}`;
 return {version:1,method:'espn-summary-scoreboard',summary:{source:`${endpoint}/summary?event=${context.id}`,checkedAt:context.summaryAt,period:null},scoreboard:{source:`${endpoint}/scoreboard?dates=${date}&limit=100`,checkedAt:context.scoreboardAt,period:2},match:facts};
}
/** Only new summary evidence can be corroborated. Never reuse a calendar row or infer from FT. */
export async function fetchPeriodEvidence(summary:Summary,context:{id:string;league:string;summaryAt:string},bucket?:R2Bucket){
 const facts=summaryFacts(summary,context.id,context.league);if(!facts)return null;
 const date=facts.kickoff.slice(0,10).replaceAll('-',''),key=`period-scoreboard/v1/${context.league}/${date}.json`;
 try{
  const cached=await readCache(bucket,key),cachedTime=time(cached?.checkedAt);
  const useCached=Number.isFinite(cachedTime)&&cachedTime<=Date.now()&&Date.now()-cachedTime<CACHE_TTL&&Math.abs(time(context.summaryAt)-cachedTime)<=PERIOD_EVIDENCE_MAX_GAP;
  const data=useCached?cached.data:await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[context.league]}/scoreboard?dates=${date}&limit=100`,bucket);
  const checkedAt=useCached?cached.checkedAt:new Date().toISOString();
  const proof=corroboratePeriod(summary,data,{...context,scoreboardAt:checkedAt});
  // An unconfirmed HTTP 200 must not replace the last verified source snapshot.
  if(proof&&!useCached)await writeCache(bucket,key,{data,checkedAt});
  return proof;
 }catch{return null}
}
