'use client';
import {useEffect,useState} from 'react';
import research from '../lib/appointed-referees.json';
import {appointmentStatus,refereeIntelligence} from '../lib/referee-intelligence';
import {findRefereeResearch} from './referee-research';

const NO_DATA='Нет данных';
const fmt=(v:any,d=2)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ru-RU',{maximumFractionDigits:d,minimumFractionDigits:0}):NO_DATA;
const pct=(v:any)=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*100)+'%':NO_DATA;
const stamp=(v:any)=>{const t=Date.parse(v||'');return Number.isFinite(t)?new Date(t).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' · Тбилиси':NO_DATA};
const day=(v:string)=>v?v.slice(0,10).split('-').reverse().join('.'):NO_DATA;
const LABELS:Record<string,string>={yellow:'Жёлтые карточки за матч',red:'Красные карточки за матч',fouls:'Фолы за матч',penalties:'Пенальти за матч'};
function Source({url,children}:{url?:string|null,children:React.ReactNode}){return url?<a href={url} target="_blank" rel="noreferrer">{children} ↗</a>:null}

const Kind=({kind}:{kind:'fact'|'estimate'|'model'})=><span className={'riKind riKind-'+kind}>{kind==='fact'?'Факты источника':kind==='estimate'?'Статистическая оценка':'Модель вероятности'}</span>;

// Stored ESPN journal for one referee; read-only, never triggers collection.
export function useRefereeJournal(name:string,skip=false){
 const [state,setState]=useState<{data:any,status:'loading'|'ready'|'error'}>({data:null,status:'loading'});
 useEffect(()=>{
  if(skip||!name||name.length<5)return;
  const c=new AbortController();
  fetch('/api/referee-journal?referee='+encodeURIComponent(name),{signal:c.signal}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(data=>setState({data,status:'ready'})).catch(e=>{if(e.name!=='AbortError')setState({data:null,status:'error'})});
  return()=>c.abort();
 },[name,skip]);
 return state;
}

function Compare({row}:{row:any}){
 const max=Math.max(row.referee??0,row.tournament??0)||1,missing=row.referee===null;
 const verdict=row.relative===null?'Сравнение недоступно':Math.abs(row.relative)<.1?'На уровне турнира':row.relative>0?`Выше среднего на ${Math.round(row.relative*100)}%`:`Ниже среднего на ${Math.round(-row.relative*100)}%`
 const caution=row.relative!==null&&row.n<5?' · мало матчей, различие ненадёжно':'';
 return <div className="riCompare"><div className="riCompareHead"><b>{LABELS[row.key]}</b><span>{missing?NO_DATA:verdict+caution}</span></div>
  <div className="riBar" aria-label={'Арбитр: '+fmt(row.referee)}><span>Арбитр</span><i style={{width:missing?0:`${100*(row.referee??0)/max}%`}}/><strong>{fmt(row.referee)}</strong></div>
  <div className="riBar riBarMuted" aria-label={'Среднее по турниру: '+fmt(row.tournament)}><span>Турнир</span><i style={{width:row.tournament===null?0:`${100*(row.tournament??0)/max}%`}}/><strong>{fmt(row.tournament)}</strong></div>
  <small>{row.n?`Арбитр: ${row.n} матч.`:'Арбитр: выборки нет.'} {row.tournamentN?(row.referees===null?`Турнир: ${row.tournamentN} матч.`:`Турнир: ${row.tournamentN} матч. у ${row.referees} других арбитров таблицы.`):'Турнир: выборки нет.'}</small></div>
}

export function RefereeAppointmentBadge({match}:{match:any}){
 const a=appointmentStatus(match);
 if(a.status==='missing')return null;
 return <span className={'riStatus riStatus-'+a.status} title={a.detail}>{a.label}</span>;
}

export default function RefereeIntelligence({name,league,data,match,row,espn}:{name:string,league:string,data:any,match?:any,row?:any,espn?:any}){
 const loaded=useRefereeJournal(name,espn!==undefined),journalData=espn!==undefined?espn:loaded.data,journalStatus=espn!==undefined?'ready':loaded.status;
 if(!name)return <section className="refIntel" aria-label="Referee Intelligence"><p className="notice">{NO_DATA}: источник не передал имя арбитра.</p></section>;
 let p;
 try{
  const journal=findRefereeResearch(name);
  p=refereeIntelligence({name,league,data,match,row,espn:journalData,journal:journal?{...journal,checkedAt:research.checkedAt}:undefined});
 }catch(error){
  console.warn('Referee Intelligence:',error);
  return <section className="refIntel" aria-label="Referee Intelligence"><p className="notice">Профиль арбитра временно недоступен. Назначение и сезонная статистика выше не изменены.</p></section>;
 }
 const s=p.season,sc=p.scenarios,j=p.journal,a=p.appointment,cb=p.comparisonBasis,cov=p.espnCoverage;
 return <section className="refIntel" aria-label={'Аналитический профиль: '+p.name}>
  <div className="sectionHead"><div><span className="eyebrow">REFEREE INTELLIGENCE</span><h3>{p.name}</h3><p>{p.tournament}{s?' · '+s.period:''}{j?.country?' · '+j.country:''}</p></div>{a&&a.status!=='missing'&&<span className={'riStatus riStatus-'+a.status}>{a.label}</span>}</div>
  {a&&<p className="definition">{a.detail} {a.checkedAt&&<>Проверено {stamp(a.checkedAt)}. </>}<Source url={a.source}>Источник назначения</Source></p>}

  <h4>Сезон в турнире <Kind kind="fact"/></h4>
  {s?<>
   <div className="riMetrics">{[['Матчей',fmt(s.n,0)],['Жёлтых за матч',fmt(s.metrics.yellow.perMatch)],['Красных за матч',fmt(s.metrics.red.perMatch)],['Фолов за матч',fmt(s.metrics.fouls.perMatch)],['Пенальти всего',fmt(s.metrics.penalties.total,0)]].map(([label,value])=><div key={label}><span>{label}</span><strong className={value===NO_DATA?'riMissing':''}>{value}</strong></div>)}</div>
   <p className="definition">Выборка: {s.n} матч. · {s.period} · обновлено {stamp(s.checkedAt)}. {s.partial?'Таблица источника включает не всех арбитров турнира. ':''}{s.note?s.note+' ':''}<Source url={s.source}>Источник статистики</Source></p>
  </>:<p className="notice">{NO_DATA}: арбитра нет в сезонной таблице этого турнира.</p>}

  <h4>Сравнение со средним по турниру <Kind kind="estimate"/></h4>
  {p.comparison.length?<>
   <div className="riCompareGrid">{p.comparison.map(row=><Compare key={row.key} row={row}/>)}</div>
   <p className="definition">{cb?.kind==='espn'?`Журнал ESPN: арбитр и все ${cb.coverage?.collected} собранных матчей турнира с 1 июня 2026 (покрытие полное). Пенальти ESPN в проекте не проверены — ${NO_DATA}. `:`Сезонная таблица источника: среднее взвешено по числу матчей, без самого арбитра.${cb?.partial?' В таблице не все арбитры турнира — это не полная статистика лиги.':''} `}{p.leagueYellow?`Справочно: в целом по турниру ${fmt(p.leagueYellow.perMatch)} ЖК за матч (${p.leagueYellow.n} матч., другой источник). `:''}<Source url={p.leagueYellow?.source}>Сводка турнира</Source></p>
  </>:<p className="notice">{NO_DATA}: сравнение с турниром недоступно — нет статистики арбитра.</p>}

  <h4>Вероятные сценарии по жёлтым карточкам <Kind kind="model"/></h4>
  {sc?<>
   <div className="riScenario">{sc.over.map(o=><div key={o.line}><span>Больше {fmt(o.line,1)} ЖК</span><strong>{pct(o.probability)}</strong><div className="riRange" aria-label={`Диапазон ${pct(o.low)}–${pct(o.high)}`}><i style={{left:`${o.low*100}%`,width:`${Math.max(1,(o.high-o.low)*100)}%`}}/><b style={{left:`${o.probability*100}%`}}/></div><small>Диапазон {pct(o.low)}–{pct(o.high)}</small></div>)}</div>
   <div className="riDistribution" aria-label="Распределение числа жёлтых карточек">{sc.distribution.map(d=><div key={d.cards}><i style={{height:`${Math.max(2,d.probability*220)}px`}}/><span>{d.cards}</span><small>{pct(d.probability)}</small></div>)}</div>
   <p className="definition"><b>Ожидаемо {fmt(sc.mean)} ЖК</b> (80% интервал среднего: {fmt(sc.interval.low)}–{fmt(sc.interval.high)}). Надёжность: <b>{sc.reliability}</b> — {sc.n} матч. арбитра. Основа: {sc.basis}.{sc.red?` Хотя бы одна красная: ${pct(sc.red.atLeastOne)}.`:' Красные карточки: '+NO_DATA+'.'}</p>
   <details className="refResearchDetails"><summary>Метод расчёта и ограничения</summary><p className="definition">{sc.method} Распределение — отрицательное биномиальное: оно учитывает неопределённость среднего при малой выборке. Диапазон под каждой вероятностью — расчёт при нижней и верхней границе 80% интервала.</p><p className="definition">Модель учитывает только арбитра и турнир. Составы, мотивация, дерби, погода и стиль команд не учтены — для оценки с командами откройте раздел «Карточки» в отчёте матча. Вероятность 60% означает, что примерно в 6 из 10 похожих матчей событие произойдёт; это не гарантия исхода.</p></details>
  </>:<p className="notice">Расчёт не выполнен. {p.scenarioBlocked}</p>}

  <h4>Последние матчи с 1 июня 2026 <Kind kind="fact"/></h4>
  {journalStatus==='loading'&&!j&&<p role="status" className="definition">Загружаю журнал матчей…</p>}
  {journalStatus==='error'&&<p className="notice">Журнал ESPN сейчас недоступен. {j?'Показан сохранённый журнал исследования.':''}</p>}
  {cov&&!cov.complete&&<p className="notice">Журнал ESPN этого турнира собран не полностью: {cov.collected} из {cov.finished} сыгранных матчей. Данные не являются полной статистикой лиги.</p>}
  {j?<>
   <div className="tableWrap"><table className="riTable"><thead><tr><th>Дата</th><th>Турнир</th><th>Матч</th><th>Жёлтые</th><th>Красные</th><th>Фолы</th></tr></thead><tbody>{j.last10.map(g=><tr key={g.date+g.home}><td>{day(g.date)}</td><td>{g.competition}</td><td><Source url={g.source}>{g.home} — {g.away}</Source>{g.score&&<small>{g.score}</small>}</td><td><b>{g.yellow}</b></td><td>{g.red??NO_DATA}</td><td>{g.fouls??NO_DATA}</td></tr>)}</tbody></table></div>
   <p className="definition">Показано {j.last10.length} из {j.n} найденных матчей · {day(j.from||'')}–{day(j.to||'')} · в среднем {fmt(j.yellow)} ЖК, {fmt(j.red)} КК и {fmt(j.fouls)} фолов за матч · журнал обновлён {stamp(j.checkedAt)}. <Source url={j.source}>{j.kind==='espn'?'ESPN: карточки и фолы обеих команд':'Журнал Soccerbase'}</Source> Отсутствие матча не означает, что арбитр его не судил.</p>
   <div className="riSplit">
    <div><h5>По турнирам</h5><div className="tableWrap"><table className="riTable"><thead><tr><th>Турнир</th><th>Матчей</th><th>ЖК за матч</th><th>КК за матч</th></tr></thead><tbody>{j.byCompetition.map(c=><tr key={c.name}><td>{c.name}</td><td>{c.n}</td><td>{fmt(c.yellow)}</td><td>{fmt(c.red)}</td></tr>)}</tbody></table></div></div>
    <div><h5>По командам</h5>{!!j.focus.length&&<p className="definition">{j.focus.map(f=>`${f.team}: ${f.n?`${f.n} матч., ${fmt(f.yellow)} ЖК за матч`:'не встречалась'}`).join(' · ')}</p>}<div className="tableWrap"><table className="riTable"><thead><tr><th>Команда</th><th>Матчей</th><th>ЖК за матч</th></tr></thead><tbody>{j.byTeam.slice(0,8).map(c=><tr key={c.name}><td>{c.name}</td><td>{c.n}</td><td>{fmt(c.yellow)}</td></tr>)}</tbody></table></div><p className="definition">Карточки обеих команд в матчах с участием команды. При 1–2 матчах различия случайны.</p></div>
   </div>
  </>:<p className="notice">{NO_DATA}: поматчевый журнал этого арбитра с 1 июня 2026 не собран. Показатели выше — сезонная таблица турнира.</p>}
 </section>
}

// Cards of all referees in the tournament's ESPN journal; read-only view of stored data.
export function RefereeLeagueCards({league,leagueName,onOpen,summary}:{league:string,leagueName:string,onOpen?:(name:string)=>void,summary?:any}){
 const [state,setState]=useState<{data:any,status:'loading'|'ready'|'error'}>({data:null,status:'loading'});
 useEffect(()=>{
  if(summary!==undefined)return;
  // Mounted with key={league}, so a new tournament starts from the initial loading state.
  const c=new AbortController();
  fetch('/api/referee-journal?league='+league+'&read=1',{signal:c.signal}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(data=>setState({data,status:'ready'})).catch(e=>{if(e.name!=='AbortError')setState({data:null,status:'error'})});
  return()=>c.abort();
 },[league,summary]);
 const d=summary!==undefined?summary:state.data,status=summary!==undefined?'ready':state.status;
 const head=<div className="sectionHead"><div><span className="eyebrow">REFEREE INTELLIGENCE · ESPN</span><h3>Арбитры турнира с 1 июня 2026</h3><p>{leagueName} · карточки и фолы обеих команд в каждом сыгранном матче</p></div></div>;
 if(status==='loading')return <section className="refIntel riLeague">{head}<p role="status" className="definition">Загружаю журнал турнира…</p></section>;
 if(status==='error'||!d)return <section className="refIntel riLeague">{head}<p className="notice">Журнал турнира сейчас недоступен. Сезонная таблица ниже не изменена.</p></section>;
 if(!d.persisted||!d.referees?.length)return <section className="refIntel riLeague">{head}<p className="notice">{NO_DATA}: журнал этого турнира ещё не собран. Сбор идёт по расписанию небольшими порциями; до его завершения используйте сезонную таблицу ниже.</p></section>;
 const avg=d.average,max=Math.max(avg.yellow.perMatch||0,...d.referees.map((r:any)=>r.yellow.perMatch||0))||1;
 return <section className="refIntel riLeague">{head}
  <p className={d.complete?'definition':'notice'}>{d.complete?`Собраны все ${d.coverage.finished} сыгранных матчей турнира с 1 июня 2026.`:`Собрано ${d.coverage.collected} из ${d.coverage.finished} сыгранных матчей — неполные данные, не статистика всей лиги.`} {d.coverage.withoutReferee?`В ${d.coverage.withoutReferee} матч. источник не указал арбитра. `:''}Обновлено {stamp(d.completedAt)}. <Source url={d.source}>ESPN</Source></p>
  <div className="riMetrics">{[['Матчей в журнале',fmt(avg.n,0)],['Жёлтых за матч',fmt(avg.yellow.perMatch)],['Красных за матч',fmt(avg.red.perMatch)],['Фолов за матч',fmt(avg.fouls.perMatch)],['Арбитров',fmt(d.referees.length,0)]].map(([label,value])=><div key={label}><span>{label}</span><strong className={value===NO_DATA?'riMissing':''}>{value}</strong></div>)}</div>
  <div className="riCards">{d.referees.slice(0,24).map((r:any)=>{const rel=r.yellow.perMatch!==null&&avg.yellow.perMatch?(r.yellow.perMatch-avg.yellow.perMatch)/avg.yellow.perMatch:null;return <article key={r.name} className="riCard">
   <div className="riCardHead"><b>{onOpen?<button onClick={()=>onOpen(r.name)}>{r.name} ↗</button>:r.name}</b><span className={'riKind riKind-'+(r.n<5?'low':'fact')}>{r.n<5?'Низкая надёжность':r.n<15?'Ограниченная надёжность':'Умеренная надёжность'}</span></div>
   <div className="riBar"><span>ЖК за матч</span><i style={{width:`${100*(r.yellow.perMatch||0)/max}%`}}/><strong>{fmt(r.yellow.perMatch)}</strong></div>
   <small>{r.n} матч. · {day(r.from||'')}–{day(r.to||'')} · КК {fmt(r.red.perMatch)} · фолы {fmt(r.fouls.perMatch)}{rel!==null&&r.n>=5?` · ${Math.abs(rel)<.1?'на уровне':rel>0?`выше на ${Math.round(rel*100)}%`:`ниже на ${Math.round(-rel*100)}%`} ${d.complete?'среднего турнира':'среднего по собранным матчам'}`:''}</small>
  </article>})}</div>
  <p className="definition">Средние — факты журнала: сумма карточек обеих команд, делённая на число матчей с данными. Сравнение с турниром показано только от 5 матчей арбитра. Пенальти ESPN не подключены — {NO_DATA}.</p>
 </section>;
}
