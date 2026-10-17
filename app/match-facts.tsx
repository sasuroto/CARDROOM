import savedHistory from '../lib/prematch-history.json';
import {officialPrematch as official} from '../lib/prematch-official';
const metrics=[['goals','Голы'],['yellow','Жёлтые карточки'],['red','Красные карточки'],['corners','Угловые'],['shots','Удары'],['target','Удары в створ'],['fouls','Совершённые фолы'],['offsides','Офсайды'],['saves','Сейвы'],['possession','Владение, %']];
const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const format=(v:number,d=1)=>v.toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d});
export function metricEvidence(match:any,analysis:any,side:'home'|'away',metric:string){
 const team=analysis?.teams?.find((t:any)=>t.side===side);
 if(analysis?.state==='in'||analysis?.state==='post'){
  const value=team?.stats?.[metric];
  return valid(value)?{value,n:0,label:'В текущем матче',sources:[analysis.source].filter(Boolean),date:analysis.checkedAt}:null;
 }
 if(!analysis?.history?.some((t:any)=>String(t.id)===String(team?.id)&&t.events?.length)&&String(match.id)===official.matchId&&match.league===official.league){
  const total=(official.totals[side] as Record<string,number>)[metric];
  if(valid(total)||metric==='possession')return {value:metric==='possession'?official.possession[side]:total/official.n,n:official.n,label:official.season,sources:[metric==='fouls'?official.sources.league:official.sources.club],date:official.checkedAt};
 }
 const saved=String(match.id)===savedHistory.matchId&&match.league===savedHistory.league?savedHistory.history:[];
 const history=analysis?.history?.find((t:any)=>String(t.id)===String(team?.id));
 const fallback=saved.find((t:any)=>t.id===(side==='home'?'17534':'8447'));
 const rows=(history?.events?.length?history.events:fallback?.events||[]).filter((e:any)=>Date.parse(e.date)<Date.parse(match.date)&&valid(e.own?.[metric]));
 if(!rows.length)return null;
 const dates=rows.map((e:any)=>e.date).sort();
 return {value:rows.reduce((s:number,e:any)=>s+e.own[metric],0)/rows.length,n:rows.length,label:`ESPN · ${analysis?.leagueName||match.league} · ${dates[0].slice(0,10)} — ${dates[dates.length-1].slice(0,10)}`,sources:rows.map((e:any)=>e.source).filter(Boolean),date:analysis?.checkedAt||savedHistory.checkedAt};
}
export default function MatchFacts({match,analysis,loading}:{match:any,analysis:any,loading:boolean}){
 const actual=analysis?.state==='in'||analysis?.state==='post';
 return <section className="matchFacts" aria-label="10 показателей матча"><h3>{actual?'10 показателей матча':'10 показателей перед матчем'}</h3><p className="definition">{actual?'Факты текущей игры.':'Средние показатели каждой команды за матч. Это история команды, а не прогноз счёта.'} {match.home} / {match.away}.</p>
 <div className="factGrid">{metrics.map(([metric,label])=><div key={metric}><span>{label}</span>{(['home','away'] as const).map(side=>{const item=metricEvidence(match,analysis,side,metric);return <div className="factTeam" key={side}><span>{match[side]}</span>{item?<><b>{format(item.value,actual&&metric!=='possession'?0:metric==='red'?2:1)}{metric==='possession'?'%':''}</b><small>{actual?item.label:`В среднем · ${item.n} матчей`}</small><details><summary>Выборка и источник</summary><p>{item.label}</p>{item.date&&<p>Проверено {new Date(item.date).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi'})} · Тбилиси</p>}{item.sources.map((url:string,i:number)=><a key={url+i} href={url} target="_blank" rel="noreferrer">Источник {i+1} ↗ </a>)}</details></>:<small className="factUnavailable">{loading?'Загружаю статистику…':'Нет подтверждённых данных'}</small>}</div>})}</div>)}</div></section>
}
