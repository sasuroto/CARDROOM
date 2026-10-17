// Referee Intelligence: a pure model over data the site already verifies.
// It never fills gaps: a metric the source does not provide stays null and the UI shows «Нет данных».
import {findRefereeRow} from './referee-match';

export const PERIOD_START='2026-06-01';
// Weight of the tournament average, in matches. With N matches of the referee the
// estimate is (10·tournament + N·referee)/(10+N): small samples stay near the tournament.
export const PRIOR_MATCHES=10;
export const CARD_LINES=[3.5,4.5,5.5];

type Num=number|null;
const finite=(v:any):v is number=>typeof v==='number'&&Number.isFinite(v);
const norm=(s:string)=>(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');

// ── Appointment status ────────────────────────────────────────────────────────
// Only a publication by a league, federation or UEFA, verified on the latest check, is «official».
const OFFICIAL_TYPE=/официальн|UEFA · проверенное/i;
const OFFICIAL_HOSTS=/(^|\.)(uefa\.com|premierleague\.com|laliga\.com|rfef\.es|dfb\.de|ligue1\.com|lfp\.fr|legaseriea\.it|aia-figc\.it|tff\.org|ligaportugal\.pt|fpf\.pt)$/;
const host=(url?:string)=>{try{return url?new URL(url).hostname:''}catch{return ''}};
export type AppointmentStatus='official'|'reported'|'unconfirmed'|'missing';
export function appointmentStatus(match:any):{status:AppointmentStatus,label:string,detail:string,checkedAt:string|null,source:string|null}{
 const checkedAt=match?.appointmentCheckedAt||match?.checkedAt||null,source=match?.appointmentSource||match?.source||null;
 if(!match?.referee)return {status:'missing',label:'Назначение не опубликовано',detail:'Источник не передал имя арбитра. Это не означает, что судья не назначен.',checkedAt:null,source:null};
 const official=OFFICIAL_TYPE.test(match.appointmentType||'')||OFFICIAL_HOSTS.test(host(match.appointmentSource));
 // `stale` alone describes the saved match record; it voids the appointment only without a positive verification.
 const unverified=match.appointmentStale||match.currentVerified===false||(match.currentVerified!==true&&(match.stale||/Сохранённ/i.test(match.appointmentType||'')));
 if(unverified)return {status:'unconfirmed',label:'Не подтверждено повторно',detail:(official?'Последнее официальное подтверждение':'Сохранённое назначение')+' — последняя проверка источника его не подтвердила. Не является официальным назначением на текущий момент.',checkedAt,source};
 if(official)return {status:'official',label:'Официальное назначение',detail:match.appointmentType||'Публикация лиги, федерации или UEFA.',checkedAt,source};
 return {status:'reported',label:'По данным источника матча',detail:(match.appointmentType||'Данные матча')+'. Это не официальная публикация лиги или федерации.',checkedAt,source};
}

// ── Season table of one tournament ────────────────────────────────────────────
export type Metric={perMatch:Num,total:Num,n:number|null};
const metric=(perMatch:any,n:any,total?:any):Metric=>finite(perMatch)&&finite(n)&&n>0?{perMatch,total:finite(total)?total:Math.round(perMatch*n),n}:{perMatch:null,total:null,n:null};
export function rowMetrics(row:any){
 return {
  yellow:metric(finite(row?.yellowTotal)&&finite(row?.yellowN||row?.n)?row.yellowTotal/(row.yellowN||row.n):row?.yellow,row?.yellowN??row?.n,row?.yellowTotal),
  red:metric(row?.red,row?.redN),
  fouls:metric(row?.fouls,row?.foulsN),
  // Balonario provides a total of penalties for the sample; other sources do not provide penalties.
  penalties:finite(row?.penalties)&&finite(row?.n)&&row.n>0?{perMatch:row.penalties/row.n,total:row.penalties,n:row.n}:{perMatch:null,total:null,n:null},
 };
}
// Tournament average from the same source table and method, excluding the referee himself.
export function tournamentAverage(rows:any[],key:'yellow'|'red'|'fouls'|'penalties',exclude?:string){
 let sum=0,n=0,referees=0;
 for(const row of rows||[]){
  if(exclude&&row.name===exclude)continue;
  const m=rowMetrics(row)[key];if(m.perMatch===null||!m.n)continue;
  sum+=m.perMatch*m.n;n+=m.n;referees++;
 }
 return n?{perMatch:sum/n,n,referees}:{perMatch:null,n:0,referees:0};
}

// ── Match journal since 1 June 2026 ───────────────────────────────────────────
export type JournalGame={date:string,competition:string,home:string,away:string,score?:string,yellow:number,red:number|null,source:string};
const valid=(g:any):g is JournalGame=>!!g&&/^\d{4}-\d{2}-\d{2}/.test(g.date||'')&&finite(g.yellow)&&g.yellow>=0&&!!g.home&&!!g.away;
function summarize(games:JournalGame[]){
 const n=games.length,yellow=games.reduce((s,g)=>s+g.yellow,0),reds=games.filter(g=>finite(g.red)),red=reds.reduce((s,g)=>s+(g.red as number),0);
 return {n,yellowTotal:yellow,yellow:n?yellow/n:null,redTotal:reds.length?red:null,red:reds.length?red/reds.length:null,redN:reds.length};
}
export function journalSummary(games:any[],{until,teams=[]}:{until?:string,teams?:string[]}={}){
 const list=(games||[]).filter(valid).filter(g=>g.date.slice(0,10)>=PERIOD_START&&(!until||g.date.slice(0,10)<until.slice(0,10))).sort((a,b)=>b.date.localeCompare(a.date));
 const group=(key:(g:JournalGame)=>string[])=>{const map=new Map<string,JournalGame[]>();for(const g of list)for(const k of key(g))map.set(k,[...(map.get(k)||[]),g]);return [...map].map(([name,items])=>({name,...summarize(items)})).sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name))};
 const same=(a:string,b:string)=>{const x=norm(a),y=norm(b);return !!x&&!!y&&(x===y||(Math.min(x.length,y.length)>=4&&(x.includes(y)||y.includes(x))))};
 return {
  ...summarize(list),
  from:list.at(-1)?.date.slice(0,10)||null,to:list[0]?.date.slice(0,10)||null,
  last10:list.slice(0,10),
  byCompetition:group(g=>[g.competition||'Турнир не указан']),
  byTeam:group(g=>[g.home,g.away]),
  // Previous games of the current match's teams with this referee (match totals, both teams).
  focus:teams.filter(Boolean).map(team=>({team,...summarize(list.filter(g=>same(g.home,team)||same(g.away,team)))})),
 };
}

// ── Card scenarios: Gamma–Poisson (negative binomial) ─────────────────────────
// Prior: Gamma with mean = tournament average and weight PRIOR_MATCHES; update with the referee's
// observed cards. The predictive distribution is negative binomial, so the sample uncertainty
// widens the probabilities instead of being hidden.
export function negBinPmf(alpha:number,beta:number,max:number){
 const q=1/(beta+1),out=[Math.pow(beta/(beta+1),alpha)];
 for(let x=0;x<max;x++)out.push(out[x]*(x+alpha)/(x+1)*q);
 return out;
}
export function poissonOver(mean:number,line:number){let p=Math.exp(-mean),cdf=0;for(let k=0;k<=Math.floor(line);k++){cdf+=p;p*=mean/(k+1)}return Math.min(1,Math.max(0,1-cdf))}
// Wilson–Hilferty approximation of a Gamma quantile; adequate for the shapes used here (α ≥ 1).
export function gammaQuantile(alpha:number,beta:number,z:number){const c=1/(9*alpha);return Math.max(0,alpha/beta*Math.pow(1-c+z*Math.sqrt(c),3))}
export function reliability(n:number){return n<5?'Низкая':n<15?'Ограниченная':'Умеренная'}

export function cardScenarios({refereeTotal,refereeN,tournamentMean,redTotal=null,redN=null,tournamentRed=null,lines=CARD_LINES}:{refereeTotal:Num,refereeN:Num,tournamentMean:Num,redTotal?:Num,redN?:Num,tournamentRed?:Num,lines?:number[]}){
 if(!finite(refereeTotal)||!finite(refereeN)||refereeN<=0||refereeTotal<0||!finite(tournamentMean)||tournamentMean<=0)return null;
 const alpha=PRIOR_MATCHES*tournamentMean+refereeTotal,beta=PRIOR_MATCHES+refereeN,mean=alpha/beta;
 const low=gammaQuantile(alpha,beta,-1.2816),high=gammaQuantile(alpha,beta,1.2816);
 const pmf=negBinPmf(alpha,beta,Math.ceil(Math.max(...lines))+1);
 const over=lines.map(line=>{const under=pmf.slice(0,Math.floor(line)+1).reduce((s,p)=>s+p,0);return {line,probability:Math.min(1,Math.max(0,1-under)),low:poissonOver(low,line),high:poissonOver(high,line)}});
 const distribution=pmf.slice(0,8).map((p,cards)=>({cards,probability:p}));
 const weight=refereeN/(PRIOR_MATCHES+refereeN);
 let red=null;
 if(finite(redTotal)&&finite(redN)&&redN>0&&finite(tournamentRed)&&tournamentRed>0){
  const a=PRIOR_MATCHES*tournamentRed+redTotal,b=PRIOR_MATCHES+redN;
  red={mean:a/b,atLeastOne:1-Math.pow(b/(b+1),a),n:redN};
 }
 return {mean,interval:{low,high,level:80},weight,n:refereeN,reliability:reliability(refereeN),over,distribution,red,
  method:`Гамма-пуассоновская модель: среднее турнира ${tournamentMean.toFixed(2)} ЖК с весом ${PRIOR_MATCHES} матчей + ${refereeTotal} ЖК арбитра в ${refereeN} матчах. Вес арбитра в оценке — ${Math.round(weight*100)}%.`};
}

// ── Full profile ──────────────────────────────────────────────────────────────
export function refereeIntelligence({name,league,data,match,journal,row}:{name:string,league:string,data:any,match?:any,journal?:any,row?:any}){
 const group=data?.refereesByLeague?.[league]||null,rows=group?.rows||[];
 const found=row||findRefereeRow(rows,name||'');
 const leagueInfo=data?.leagues?.find((l:any)=>l.id===league);
 const metrics=found?rowMetrics(found):null;
 const average={yellow:tournamentAverage(rows,'yellow',found?.name),red:tournamentAverage(rows,'red',found?.name),fouls:tournamentAverage(rows,'fouls',found?.name),penalties:tournamentAverage(rows,'penalties',found?.name)};
 const comparison=metrics?(['yellow','red','fouls','penalties'] as const).map(key=>{
  const ref=metrics[key].perMatch,avg=average[key].perMatch;
  return {key,referee:ref,tournament:avg,difference:finite(ref)&&finite(avg)?ref-avg:null,relative:finite(ref)&&finite(avg)&&avg>0?(ref-avg)/avg:null,n:metrics[key].n,tournamentN:average[key].n,referees:average[key].referees};
 }):[];
 // A finished match must not count itself or later games.
 const until=match?.date&&Date.parse(match.date)<Date.now()?match.date:undefined;
 const games=journal?.matches?journalSummary(journal.matches,{until,teams:[match?.home,match?.away].filter(Boolean)}):null;
 // Prefer the season table of this tournament: same scope as the tournament average.
 const scenarios=metrics&&group?.seasonConfirmed!==false?cardScenarios({refereeTotal:metrics.yellow.total,refereeN:metrics.yellow.n,tournamentMean:average.yellow.perMatch,redTotal:metrics.red.perMatch!==null&&metrics.red.n?Math.round(metrics.red.perMatch*metrics.red.n):null,redN:metrics.red.n,tournamentRed:average.red.perMatch}):null;
 return {
  name:found?.name||name,query:name,league,tournament:leagueInfo?.name||league,
  appointment:match?appointmentStatus(match):null,
  season:found&&metrics?{name:found.name,period:group?.periodLabel||leagueInfo?.season||'Сезон 2026/27',source:group?.source||null,checkedAt:group?.checkedAt||null,partial:!!group?.partial,seasonConfirmed:group?.seasonConfirmed!==false,note:group?.dataNote||null,n:found.n,metrics}:null,
  comparison,
  leagueYellow:finite(leagueInfo?.yellowSummary?.avg)?{perMatch:leagueInfo.yellowSummary.avg,n:leagueInfo.yellowSummary.n,source:leagueInfo.yellowSummary.source,checkedAt:leagueInfo.yellowSummary.checkedAt}:null,
  journal:games&&games.n?{...games,source:journal.source||null,checkedAt:journal.checkedAt||null,crossSource:journal.crossSource||null,country:journal.country||null}:null,
  scenarios,
  scenarioBlocked:!scenarios?(!metrics?'Нет сезонной статистики арбитра в этом турнире.':group?.seasonConfirmed===false?'Сезон источника не подтверждён — расчёт не выполняется.':!finite(average.yellow.perMatch)?'Нет среднего по турниру для сравнения.':'Недостаточно данных о жёлтых карточках.'):null,
 };
}
