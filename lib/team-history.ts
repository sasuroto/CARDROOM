import {STAT_KEYS,teamStats} from './match-analysis';
import {LEAGUES} from './fixtures';
import {sourceNumber} from './league-table';

export const TEAM_METRICS=['goals',...Object.keys(STAT_KEYS)] as const;
export type MetricValues=Record<string,number|null>;
export type TeamEvent={id:string;date:string;league:string;state:'pre'|'in'|'post';home:string;away:string;homeId:string;awayId:string;homeLogo:string|null;awayLogo:string|null;homeScore:number|null;awayScore:number|null;source:string;side:'home'|'away';own:MetricValues;against:MetricValues;detailsAvailable:boolean;checkedAt?:string;stale?:boolean;detailsCheckedAt?:string;detailsStale?:boolean};
export type TeamProfile={league:string;season:number;seasonLabel:string;team:{id:string;name:string;logo:string|null;source:string}|null;events:TeamEvent[];checkedAt:string|null;source:string;errors:string[];coverage:{completed:number;withDetails:number;detailLimit:number};stale?:boolean;error?:string;attemptedAt?:string};
export function blankMetrics():MetricValues{return Object.fromEntries(TEAM_METRICS.map(k=>[k,null]))}
function score(raw:any){return sourceNumber(typeof raw==='object'&&raw!==null?raw.value??raw.displayValue:raw)}
export function parseTeamSchedule(doc:any,league:string,id:string,season:number){
 if(String(doc?.team?.id)!==id||Number((doc.requestedSeason||doc.season)?.year)!==season||!Array.isArray(doc.events))throw Error('Другой профиль или сезон');
 const events:TeamEvent[]=[],seen=new Set<string>();
 for(const event of doc.events){
  // Team schedules can contain other competitions. Never mix them into form.
  if(event.league?.slug!==LEAGUES[league]||Number(event.season?.year)!==season)continue;
  const c=event.competitions?.[0],h=c?.competitors?.find((x:any)=>x.homeAway==='home'),a=c?.competitors?.find((x:any)=>x.homeAway==='away'),state=c?.status?.type?.state;
  if(!h?.team?.id||!a?.team?.id||String(h.team.id)===String(a.team.id)||![String(h.team.id),String(a.team.id)].includes(id)||!['pre','in','post'].includes(state)||!Number.isFinite(Date.parse(event.date))||!/^\d{5,12}$/.test(String(event.id))||seen.has(String(event.id)))continue;
  seen.add(String(event.id));const homeScore=state==='pre'?null:score(h.score),awayScore=state==='pre'?null:score(a.score),side=String(h.team.id)===id?'home':'away';
  const own=blankMetrics(),against=blankMetrics();own.goals=side==='home'?homeScore:awayScore;against.goals=side==='home'?awayScore:homeScore;
  events.push({id:String(event.id),date:event.date,league,state,home:h.team.displayName,away:a.team.displayName,homeId:String(h.team.id),awayId:String(a.team.id),homeLogo:h.team.logo||h.team.logos?.[0]?.href||null,awayLogo:a.team.logo||a.team.logos?.[0]?.href||null,homeScore,awayScore,source:`https://www.espn.com/soccer/match/_/gameId/${event.id}`,side,own,against,detailsAvailable:false});
 }
 const team={id,name:doc.team.displayName||doc.team.name||id,logo:doc.team.logo||doc.team.logos?.[0]?.href||null,source:`https://www.espn.com/soccer/club/_/id/${id}`};
 return{team,events};
}
export function applyTeamDetails(event:TeamEvent,doc:any,season:number,checkedAt?:string):TeamEvent{
 const c=doc?.header?.competitions?.[0];
 if(String(doc?.header?.id??c?.id)!==event.id||doc?.header?.league?.slug!==LEAGUES[event.league]||Number(doc?.header?.season?.year)!==season||c?.status?.type?.state!=='post'||!c.competitors?.some((t:any)=>String(t.team?.id)===event.homeId)||!c.competitors?.some((t:any)=>String(t.team?.id)===event.awayId))throw Error('Другой исторический матч');
 const ownId=event.side==='home'?event.homeId:event.awayId,againstId=event.side==='home'?event.awayId:event.homeId,own=teamStats(doc,ownId),against=teamStats(doc,againstId);
 // Keep the schedule score when the boxscore omits it, never replace it with zero.
 own.goals=own.goals??event.own.goals;against.goals=against.goals??event.against.goals;
 return {...event,own,against,homeScore:event.side==='home'?own.goals:against.goals,awayScore:event.side==='home'?against.goals:own.goals,detailsAvailable:TEAM_METRICS.some(k=>k!=='goals'&&(own[k]!==null||against[k]!==null)),...(checkedAt?{detailsCheckedAt:checkedAt}:{})};
}
export function selectTeamHistory(events:TeamEvent[],options:{limit:number|'all';venue:'all'|'home'|'away'}){
 const selected=events.filter(e=>e.state==='post'&&(options.venue==='all'||e.side===options.venue)).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 return options.limit==='all'?selected:selected.slice(0,Math.max(0,options.limit));
}
function result(event:TeamEvent){const a=event.own.goals,b=event.against.goals;return a===null||b===null?null:a>b?'W':a<b?'L':'D'}
function aggregate(values:(number|null)[]){const known=values.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));return{n:known.length,total:known.length?known.reduce((a,b)=>a+b,0):null,average:known.length?known.reduce((a,b)=>a+b,0)/known.length:null}}
export function summarizeTeamHistory(input:TeamEvent[]){
 const events=input.filter(e=>e.state==='post').sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)),results=events.map(result),known=results.filter(r=>r!==null);
 const metrics=Object.fromEntries(TEAM_METRICS.map(key=>[key,{own:aggregate(events.map(e=>e.own[key]??null)),against:aggregate(events.map(e=>e.against[key]??null)),total:aggregate(events.map(e=>e.own[key]==null||e.against[key]==null?null:e.own[key]!+e.against[key]!))}]));
 const threshold=(key:string,min:number,both=false)=>{const values=events.filter(e=>e.own[key]!=null&&e.against[key]!=null),hits=values.filter(e=>both?e.own[key]!>0&&e.against[key]!>0:e.own[key]!+e.against[key]!>min).length;return{hits,n:values.length,rate:values.length?100*hits/values.length:null}};
 return{n:events.length,scoredN:known.length,wins:known.filter(r=>r==='W').length,draws:known.filter(r=>r==='D').length,losses:known.filter(r=>r==='L').length,form:results.slice(0,5).filter((r):r is 'W'|'D'|'L'=>r!==null),metrics,thresholds:{goals25:threshold('goals',2.5),btts:threshold('goals',0,true),corners95:threshold('corners',9.5),yellow45:threshold('yellow',4.5)}};
}
