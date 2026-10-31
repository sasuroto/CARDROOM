'use client';
import {findRefereeRow} from '../lib/referee-match';
import {appointmentState,STATE_LABEL,AUTHORITIES,FALLBACK_SOURCE} from '../lib/referee-authority';
import {findRefereeResearch} from './referee-research';
import refs from '../lib/referees.json';

const fmt=(v:any,d=2)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ru-RU',{maximumFractionDigits:d}):null;
const stamp=(v?:string)=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):null;
const day=(v:string)=>v.slice(0,10).split('-').reverse().join('.');

// Season statistics come only from the tournament table for this match's league.
// Cross-competition match journals are shown separately, with each row labelled.
export function refereeSeasonStats(name:string|null|undefined,league:string,data:any){
 const group=data?.refereesByLeague?.[league]||(refs as any)[league];
 const row=name?findRefereeRow(group?.rows||[],name):undefined;
 if(!row)return {group,row:null};
 const n=Number(row.n)||0;
 return {group,row,n,yellow:row.yellow,red:row.red,penalties:typeof row.penalties==='number'&&n?row.penalties/n:null,estimatedYellow:row.yellowTotal===undefined,small:n<10,seasonConfirmed:group?.seasonConfirmed!==false};
}

export default function RefereeIntel({match,data}:{match:any,data:any}){
 const state=appointmentState(match),label=STATE_LABEL[state],authority=AUTHORITIES[match.league];
 const research=match.referee?findRefereeResearch(match.referee):undefined;
 const s=refereeSeasonStats(match.referee,match.league,data);
 const country=match.refereeCountry||research?.country||null;
 const leagueName=data?.leagues?.find((l:any)=>l.id===match.league)?.name||match.league;
 const lastFive=(research?.matches||[]).slice().sort((a:any,b:any)=>b.date.localeCompare(a.date)).filter((g:any)=>!match.date||g.date<String(match.date).slice(0,10)||match.state==='post').slice(0,5);
 const crew=[['Ассистенты',match.assistants?.join(' · ')],['VAR',match.var||match.videoOfficials?.join(' · ')],['Ассистент VAR',match.avar],['Резервный арбитр',match.fourthOfficial]];
 return <section className="refIntel" aria-label="Арбитр: назначение и статистика">
  <div className="refIntelHead">
   <div><span className="eyebrow">АРБИТР · НАЗНАЧЕНИЕ И СТАТИСТИКА</span><h3>{match.referee||'Имя арбитра пока не получено'}</h3><p>{country?country+' · ':''}{match.appointmentType||authority?.authority||'Источник назначения не указан'}</p></div>
   <span className={'refState refState-'+state} title={label.hint}>{label.label}</span>
  </div>
  <p className="refIntelHint">{label.hint}</p>
  {match.appointmentConflict&&<p className="notice">Резервный источник указывает другого арбитра: {match.appointmentConflict.referee}. Приоритет у официальной публикации; расхождение будет перепроверено.</p>}
  {match.referee&&<>
   <div className="refIntelMetrics">
    {[['Матчей в сезоне',s.row?String(s.n):null],['ЖК / матч',s.row?fmt(s.yellow):null],['КК / матч',s.row?fmt(s.red):null],['Пенальти / матч',s.row?fmt(s.penalties):null]].map(([k,v])=><div key={k as string}><span>{k}</span><strong>{v??'—'}</strong></div>)}
   </div>
   <p className="refIntelMeta">{s.row?<>{leagueName} · {s.group?.periodLabel||'2026/27'}{!s.seasonConfirmed&&' · сезон в источнике не подтверждён'}{s.small&&' · малая выборка (меньше 10 матчей)'}{s.estimatedYellow&&' · ЖК/матч — среднее из источника, сумма не опубликована'}{s.penalties===null&&' · пенальти: источник турнира не публикует'}</>:'Статистики этого арбитра в таблице турнира пока нет. Показатели не подставляются из других турниров.'}</p>
   <dl className="refIntelCrew">{crew.map(([k,v])=><div key={k as string}><dt>{k}</dt><dd>{v||'Нет данных в источнике'}</dd></div>)}</dl>
   <div className="refIntelJournal"><h4>Последние матчи арбитра</h4>{lastFive.length?<ol>{lastFive.map((g:any)=><li key={g.date+g.home}><span>{day(g.date)}</span><b>{g.home} — {g.away}</b><small>{g.competition} · {g.score} · ЖК {g.yellow}{g.red!==null&&g.red!==undefined?' · КК '+g.red:''}</small></li>)}</ol>:<p>Журнал матчей этого арбитра не подключён. Последние игры не показываются, чтобы не подменять их догадкой.</p>}{lastFive.length>0&&<p className="refIntelMeta">Журнал включает разные турниры; турнир указан в каждой строке.</p>}</div>
   <p className="refIntelMeta">Разбивка «дома / в гостях»: подключённые источники не дают карточек по командам для этого арбитра.</p>
  </>}
  <p className="refIntelSource">
   {(match.appointmentSource||match.source)&&<a href={match.appointmentSource||match.source} target="_blank" rel="noreferrer">Источник назначения ↗</a>}
   {stamp(match.appointmentCheckedAt)&&<span>Подтверждено: {stamp(match.appointmentCheckedAt)} · Тбилиси</span>}
   {stamp(match.appointmentLastAttempt)&&<span>Последняя проверка: {stamp(match.appointmentLastAttempt)}</span>}
   {s.group?.source&&<a href={s.group.source} target="_blank" rel="noreferrer">Источник статистики ↗</a>}
   {stamp(s.group?.checkedAt)&&<span>Статистика: {stamp(s.group?.checkedAt)}</span>}
  </p>
  <p className="refIntelMeta">Иерархия: {authority?authority.authority+' → ':''}{FALLBACK_SOURCE.authority} (резерв). {authority?.integration==='manual-verified'?'Официальные назначения этого турнира вносятся после ручной проверки.':''}</p>
 </section>;
}
