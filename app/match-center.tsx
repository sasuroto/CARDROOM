'use client';
import {useEffect,useRef,useState} from 'react';
import {findRefereeRow} from '../lib/referee-match';
import {appointmentStatus} from '../lib/referee-intelligence';
import RefereeIntelligence from './referee-intelligence';
import {matchLocation} from '../lib/match-location';
import research from '../lib/match-research.json';
import snapshot from '../lib/fixture-snapshot.json';
import refs from '../lib/referees.json';
import MatchReport from './match-report';
import MatchOverview from './match-overview';
import {useMatchDetails} from './use-match-details';
import {withAppointment} from '../lib/fixture-display';
import {FavoriteStar,useFavorites} from './favorites';
import {RefereeResearchProfile,findRefereeResearch} from './referee-research';
const day=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tbilisi',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const time=(d:string)=>new Date(d).toLocaleTimeString('ru-RU',{timeZone:'Asia/Tbilisi',hour:'2-digit',minute:'2-digit'});
const num=(n:any,d=2)=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(d).replace('.',','):'—';
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
export function refereeProfile(name:string,league:string,data:any,row?:any){
 const group=data.refereesByLeague?.[league]||(refs as any)[league];const r=row||findRefereeRow(group?.rows||[],name);
 if(!r)return {name,displayName:name,stats:[],analysis:['Назначение найдено, но подтверждённая статистика этого судьи пока отсутствует в базе.'],source:group?.source};
 return {name:r.name,displayName:r.name,league,row:r,season:group.periodLabel||'2026/27',checkedAt:group.checkedAt,source:group.source,stats:[{label:data.leagues.find((l:any)=>l.id===league)?.name||league,n:r.n,yellowN:r.yellowN,yellowTotal:r.yellowTotal??Math.round(r.yellow*r.yellowN),estimated:r.yellowTotal===undefined,yellow:r.yellow,red:r.red,fouls:r.fouls}],analysis:[...(group.dataNote?[group.dataNote]:[]),r.n<10?'Меньше 10 матчей: рано делать устойчивый вывод о строгости судьи.':'Оценка относится только к указанному турниру и периоду.', 'Частоты тоталов, пенальти и история по отдельным матчам для этого профиля пока не подтверждены.']};
}
function Link({url,children}:{url?:string,children:any}){return url?<a href={url} target="_blank" rel="noreferrer">{children} ↗</a>:null}
export function RefereeDialog({item,onClose,data}:{item:any,onClose:()=>void,data:any}){
 const el=useRef<HTMLDialogElement>(null);
 const updated=useMatchDetails(item?.match);
 useEffect(()=>{if(!item)return;const dlg=el.current;if(dlg&&!dlg.open)dlg.showModal();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{dlg?.close();document.body.style.overflow=old}},[item]);
 if(!item)return null;const m=updated.match,p=m?.referee?refereeProfile(m.referee,m.league,data):item.profile,stats=p?.stats||[],primary=stats[0];
 return <dialog ref={el} className="refDialog" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose()}} aria-labelledby="refHeroTitle"><div className="dialogToolbar"><button className="heroClose" onClick={onClose} aria-label="Закрыть профиль">Закрыть ×</button></div>{m?<MatchOverview match={m} leagueName={data.leagues.find((l:any)=>l.id===m.league)?.name} loading={item.loading} titleId="refHeroTitle"/>:(<div className={"refHeroTop "+(m?"compactJudge":"")}><span className="eyebrow">01 / СУДЬЯ МАТЧА</span>{m&&<p className="heroFixture">{m.home} <span>—</span> {m.away}<small>{day(new Date(m.date))} · {time(m.date)} · время по Тбилиси (UTC+4)<br/>{matchLocation(m)}</small></p>}<div className="refHeroName"><div><span className="refCountry">{m?.refereeCountry||p?.country||'Главный арбитр'}{p?.birthDate?' · родился '+new Date(p.birthDate).toLocaleDateString('ru-RU'):''}</span><h2 id="refHeroTitle">{p?.displayName||(item.loading?'Проверяю назначение…':'В источнике нет данных об арбитре')}</h2>{p?.name&&p.name!==p.displayName&&<p>{p.name}</p>}<p>{p?.bio||(!p?'Источник не передал имя арбитра. Это не означает, что судья ещё не назначен.':primary?'Статистика выбранного турнира и сезона.':findRefereeResearch(p.name)?'Исследование с 1 июня 2026 — ниже.':'Назначение подтверждено. Статистика арбитра пока отсутствует в базе.')}</p>{m?.lastAttemptAt&&<p className="definition">Последняя проверка назначения: {day(new Date(m.lastAttemptAt))} {time(m.lastAttemptAt)} · Тбилиси (UTC+4).{!m.referee?' Имя появится после подтверждения источником.':''}</p>}</div><div className="refMonogram" aria-hidden="true">{p?.name?.split(' ').map((n:string)=>n[0]).slice(0,2).join('')||'?'}</div></div>{m?.referee&&<div className="appointmentLine"><span>{m.appointmentType||'Подтверждённое назначение'}{(m.appointmentCheckedAt||m.checkedAt)?' · проверено '+day(new Date(m.appointmentCheckedAt||m.checkedAt))+' '+time(m.appointmentCheckedAt||m.checkedAt)+' по Тбилиси':''}</span><Link url={m.appointmentSource||m.source}>Источник назначения</Link></div>}</div>)}
 <div className="refHeroBody">{m?.referee&&<section className="officialTeam" aria-label="Судейская бригада"><h3>Судейская бригада</h3><dl>{[['Главный арбитр',m.referee],['Ассистенты',m.assistants?.join(' · ')],['VAR',m.var],['Ассистент VAR',m.avar],['Резервный арбитр',m.fourthOfficial]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Нет данных в источнике'}</dd></div>)}</dl></section>}{item.loading&&<p role="status">Проверяю назначение…</p>}{m?.error&&<div className="notice">{m.error}</div>}{m?.stale&&<div className="notice">Показано сохранённое назначение. Повторная проверка источника недоступна.</div>}
 {primary&&<><div className="heroStatGrid"><div><label>МАТЧЕЙ</label><strong>{primary.n}</strong></div><div className="highlight"><label>ЖЁЛТЫХ · ВСЕГО</label><strong>{primary.estimated?'≈ ':''}{primary.yellowTotal}</strong></div><div><label>ЖК / МАТЧ</label><strong>{num(primary.yellow??primary.yellowTotal/(primary.yellowN||primary.n))}</strong></div><div><label>КРАСНЫХ {primary.redTotal===undefined?'/ МАТЧ':'· ВСЕГО'}</label><strong>{primary.redTotal??num(primary.red)}</strong></div></div><p className="definition">{primary.label} · {p.season} · проверено {p.checkedAt?day(new Date(p.checkedAt)):'—'}. {primary.estimated?'≈ — расчёт из округлённого среднего.':''} {primary.yellowN&&primary.yellowN!==primary.n?'Данные ЖК есть по '+primary.yellowN+' матчам.':''} <Link url={p.source}>Статистика источника</Link></p></>}
 {!m&&p?.league&&p.row&&<RefereeIntelligence name={p.name} league={p.league} row={p.row} data={{...data,refereesByLeague:{...refs,...data.refereesByLeague}}}/>}
 {p?.name&&findRefereeResearch(p.name)&&<details className="refResearchDetails" open={!!m}><summary>Исследование арбитра с 1 июня 2026</summary><RefereeResearchProfile key={p.name} name={p.name}/></details>}
 {m&&!item.loading&&<MatchReport showOverview={false} key={m.id} match={m} profile={p} data={{...data,refereesByLeague:{...refs,...data.refereesByLeague}}}/>}
 <details className="refArchive"><summary>Подробная статистика и история судьи</summary>
 {stats.length>1&&<><h3>Разбивка по турнирам</h3><div className="tableWrap"><table><thead><tr><th>ТУРНИР · {p.season}</th><th>МАТЧЕЙ</th><th>ЖК ВСЕГО</th><th>ЖК / МАТЧ</th><th>ФОЛЫ / МАТЧ</th></tr></thead><tbody>{stats.slice(1).map((s:any)=><tr key={s.label}><td>{s.label}</td><td>{s.n}</td><td>{s.yellowTotal}</td><td>{num(s.yellowTotal/s.n)}</td><td>{num(s.foulsTotal/s.n)}</td></tr>)}</tbody></table></div></>}
 {p?.history&&<div className="historyStrip"><b>{p.history.label}</b><span>{p.history.n} матчей</span><span>{p.history.yellowTotal} ЖК</span><span>{num(p.history.yellowTotal/p.history.n)} ЖК / матч</span></div>}
 {p?.analysis&&!findRefereeResearch(p.name||'')&&<><h3>Что говорят данные</h3><div className="refAnalysis">{p.analysis.map((s:string,i:number)=><article key={s}><span>{String(i+1).padStart(2,'0')}</span><p>{s}</p></article>)}</div></>}
 {p?.recent&&<><h3>Матчи сезона: сколько ЖК в каждом</h3><div className="tableWrap"><table><thead><tr><th>МАТЧ</th><th>ДАТА</th><th>ТУРНИР</th><th>ЖК · ОБЕ КОМАНДЫ</th></tr></thead><tbody>{p.recent.map((r:any)=><tr key={r.date}><td>{r.match}</td><td>{r.date}</td><td>{r.league}</td><td><b>{r.yellow}</b></td></tr>)}</tbody></table></div><p className="definition">Сохранённый срез на {day(new Date(p.checkedAt))}; выбранная предстоящая игра в итог не включена. <Link url={p.source}>Проверить журнал</Link></p></>}
 {false&&m&&<div className="notice">Контекст матча: {m.home} — {m.away}. Статистика судьи — один из факторов; автоматической оценки вероятности тотала для этой пары пока нет. Домашний турнир, ЛЧ и смешанный сезон не подменяют друг друга.</div>}
 {p?.crossSource&&<p className="definition"><Link url={p.crossSource}>Дополнительная сверка показателей</Link></p>}

 </details>
 </div></dialog>
}
export const CALENDAR_MIN='2025-01-01',CALENDAR_MAX='2028-12-31';
export function shiftCalendarDay(value:string,offset:number){
 const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime()))return value;
 d.setUTCDate(d.getUTCDate()+offset);const result=d.toISOString().slice(0,10);return result<CALENDAR_MIN?CALENDAR_MIN:result>CALENDAR_MAX?CALENDAR_MAX:result;
}
export function calendarMatchStatus(m:any,now=Date.now()){
 return m.state==='in'?'live':m.state==='post'?'finished':m.state==='pre'&&Date.parse(m.date)>=now?'upcoming':'unknown';
}
const searchText=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
export function filterCalendarEvents(events:any[],status:string,query:string,onlyFavorites:boolean,isFavorite:(m:any)=>boolean,now=Date.now()){
 const q=searchText(query);
 return events.filter(m=>(status==='all'||calendarMatchStatus(m,now)===status)&&(!q||searchText(m.home+' '+m.away).includes(q))&&(!onlyFavorites||isFavorite(m))).sort((a,b)=>{
  const rank=(m:any)=>({live:0,upcoming:1,finished:2,unknown:3}[calendarMatchStatus(m,now)]);
  return rank(a)-rank(b)||(calendarMatchStatus(a,now)==='finished'?Date.parse(b.date)-Date.parse(a.date):Date.parse(a.date)-Date.parse(b.date));
 });
}
function CalendarCrest({src,name}:{src?:string,name:string}){
 const [broken,setBroken]=useState(false);useEffect(()=>setBroken(false),[src]);
 return src&&!broken?<img src={src} alt="" loading="lazy" onError={()=>setBroken(true)}/>:<span className="calendarCrestFallback" aria-hidden="true">{name.slice(0,2)}</span>;
}
export default function MatchCenter({data,league='all',onLeagueChange,date=day(),onDateChange,autoUpcoming=false,onAutoDateChange}:{data:any,league?:string,onLeagueChange?:(id:string)=>void,date?:string,onDateChange?:(date:string)=>void,autoUpcoming?:boolean,onAutoDateChange?:(date:string)=>void}){
 const setDate=(value:string)=>onDateChange?.(value),setLeague=(value:string)=>onLeagueChange?.(value);
 const favorites=useFavorites();
 const [events,setEvents]=useState<any[]>(()=>snapshot.events.filter(f=>day(new Date(f.date))===date&&(league==='all'||f.league===league))),[loading,setLoading]=useState(false),[error,setError]=useState(''),[stamp,setStamp]=useState(''),[selected,setSelected]=useState<any>(null),[reload,setReload]=useState(0);const token=useRef(0),scope=useRef('');
 const [status,setStatus]=useState('all'),[query,setQuery]=useState(''),[view,setView]=useState<'list'|'cards'>('list'),[onlyFavorites,setOnlyFavorites]=useState(false);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');const key=date+'|'+league;if(scope.current!==key){scope.current=key;setStamp('');setEvents(snapshot.events.filter(f=>day(new Date(f.date))===date&&(league==='all'||f.league===league)))}
 async function load(){try{const get=async(upcoming=false)=>{const r=await fetch(`/api/matches?date=${date}&league=${league}${upcoming?'&upcoming=1':''}`,{signal:controller.signal});if(!r.ok)throw Error();return r.json()};let d:any=await get();if(autoUpcoming&&date===day()&&league!=='all'&&!d.events?.length&&!d.errors?.length)d=await get(true);if(controller.signal.aborted)return;setEvents((d.events||[]).filter((m:any)=>league==='all'||m.league===league));setStamp(d.checkedAt);if(d.upcoming&&d.events?.length&&d.date!==date)onAutoDateChange?.(d.date);if(d.errors?.length)setError('Часть источников не ответила: '+d.errors.map((id:string)=>data.leagues.find((l:any)=>l.id===id)?.name||id).join(', '))}catch(e:any){if(!controller.signal.aborted&&e.name!=='AbortError')setError('Календарь сейчас недоступен. Сохранена последняя полученная выдача; её полнота и актуальность не подтверждены.')}finally{if(!controller.signal.aborted)setLoading(false)}}load();return()=>controller.abort()},[date,league,reload,autoUpcoming]);
 async function open(m:any){const t=++token.current;setSelected({match:m,profile:m.referee?refereeProfile(m.referee,m.league,data):null,loading:true});try{const r=await fetch(`/api/match?id=${m.id}&league=${m.league}`);if(!r.ok)throw Error();const a:any=await r.json();if(t!==token.current)return;const match=withAppointment(m,a);setSelected({match,profile:match.referee?refereeProfile(match.referee,m.league,data):null})}catch{if(t===token.current)setSelected({match:{...m,error:'Повторная проверка назначения недоступна.'},profile:m.referee?refereeProfile(m.referee,m.league,data):null})}}
 const isFavorite=(m:any)=>favorites.has('match',m.league+':'+m.id),now=Date.now(),visible=filterCalendarEvents(events,status,query,onlyFavorites,isFavorite,now),today=day();
 const statusOptions=[['all','Все'],['live','В игре'],['upcoming','Предстоящие'],['finished','Завершённые']];
 const clearFilters=()=>{setStatus('all');setQuery('');setOnlyFavorites(false)};
 return <section className="matchCenter calendarCenter" aria-labelledby="matchTitle">
  <div className="calendarToolbar">
   <div className="calendarDateControls"><div className="calendarDays" aria-label="Быстрый выбор даты"><button type="button" aria-label="Предыдущий день" disabled={date<=CALENDAR_MIN} onClick={()=>setDate(shiftCalendarDay(date,-1))}>←</button><button type="button" aria-pressed={date===today} onClick={()=>setDate(today)}>Сегодня</button><button type="button" aria-label="Следующий день" disabled={date>=CALENDAR_MAX} onClick={()=>setDate(shiftCalendarDay(date,1))}>→</button></div><label>Дата игры · Тбилиси, UTC+4<input type="date" min={CALENDAR_MIN} max={CALENDAR_MAX} value={date} onChange={e=>{if(e.target.value>=CALENDAR_MIN&&e.target.value<=CALENDAR_MAX)setDate(e.target.value)}}/></label></div>
   <div className="calendarSearchControls"><label>Турнир<select value={league} onChange={e=>setLeague(e.target.value)}><option value="all">Все {data.leagues.length} турниров</option>{data.leagues.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Найти команду<input type="search" value={query} placeholder="Название команды" onChange={e=>setQuery(e.target.value)}/></label></div>
  </div>
  <div className="calendarViewControls"><div className="calendarStatuses" aria-label="Статус матча">{statusOptions.map(([id,label])=><button type="button" key={id} aria-pressed={status===id} onClick={()=>setStatus(id)}>{label}<span>{id==='all'?events.length:events.filter(m=>calendarMatchStatus(m,now)===id).length}</span></button>)}</div><div className="calendarPreferences"><button type="button" aria-pressed={onlyFavorites} onClick={()=>setOnlyFavorites(v=>!v)}>★ Избранные</button><div className="calendarViewSwitch" aria-label="Вид календаря"><button type="button" aria-pressed={view==='list'} onClick={()=>setView('list')}>Список</button><button type="button" aria-pressed={view==='cards'} onClick={()=>setView('cards')}>Карточки</button></div><button type="button" className="outline calendarRefresh" disabled={loading} onClick={()=>setReload(n=>n+1)}>↻ Проверить</button></div></div>
  {error&&<div className="notice" role="status">{error}</div>}{loading&&<p role="status">Проверяю календарь…</p>}
  <p className="calendarResultCount" aria-live="polite">Показано {visible.length} из {events.length} матчей{onlyFavorites?' · избранные на выбранную дату':''}{!stamp&&events.length?' · сохранённый срез':''}</p>
  <div className={'calendarResults '+(view==='cards'?'calendarCards':'calendarList')} aria-busy={loading}>
   {visible.map(m=>{const matchStatus=calendarMatchStatus(m,now),played=m.state==='in'||m.state==='post',saved=!stamp||m.stale,leagueName=data.leagues.find((l:any)=>l.id===m.league)?.name||m.league;const statusLabel=matchStatus==='live'?(m.clock||'В игре'):matchStatus==='finished'?'Завершён':matchStatus==='upcoming'?'Предстоит':'Статус уточняется';return <article className={'calendarMatch '+(matchStatus==='live'&&!saved?'isLive':'')} key={m.league+':'+m.id}>
    <button className="calendarOpen" onClick={()=>open(m)} aria-label={`${m.home} — ${m.away}. ${played?(m.homeScore??'—')+' : '+(m.awayScore??'—')+'. ':''}${statusLabel}. ${time(m.date)}, Тбилиси. Открыть матч и арбитра`}>
     <span className="calendarKickoff"><b>{time(m.date)}</b><span className="calendarStatus">{statusLabel}</span></span>
     <span className="calendarTeams"><span><CalendarCrest src={m.homeLogo} name={m.home}/><b>{m.home}</b><strong>{played?m.homeScore??'—':''}</strong></span><span><CalendarCrest src={m.awayLogo} name={m.away}/><b>{m.away}</b><strong>{played?m.awayScore??'—':''}</strong></span></span>
     <span className="calendarMatchContext"><span>{leagueName}</span><span className="calendarVenue">{matchLocation(m)}</span><span className="calendarReferee">{m.referee?'Арбитр: '+m.referee+(appointmentStatus(m).status==='unconfirmed'?' · не подтверждено':''):'Назначение — внутри матча'}</span>{saved&&<span className="calendarSaved">Сохранённый срез</span>}</span><span className="calendarOpenArrow" aria-hidden="true">↗</span>
    </button><button className="calendarFavorite" disabled={!favorites.ready} aria-pressed={isFavorite(m)} aria-label={`${isFavorite(m)?'Убрать из избранного':'В избранное'}: ${m.home} — ${m.away}`} onClick={()=>favorites.toggle('match',m.league+':'+m.id,m.home+' — '+m.away,m.league)}><FavoriteStar active={isFavorite(m)}/></button>
   </article>})}
  </div>
  {!loading&&!visible.length&&<div className="empty">{events.length?<><h3>Нет матчей по выбранным фильтрам</h3><p>{onlyFavorites?'На эту дату нет подходящих избранных игр. Звезда рядом с матчем сохраняет его на этом устройстве.':'Измените статус или название команды. Данные календаря доступны.'}</p><button className="outline" onClick={clearFilters}>Сбросить фильтры</button></>:<><h3>{error?'Данные на эту дату не получены':'В источнике нет матчей на эту дату'}</h3><p>Выберите другой день или турнир. Пустой ответ источника не подтверждает полноту календаря.</p></>}</div>}
  <div className="calendarNotes"><span className="eyebrow">КАЛЕНДАРЬ ТУРНИРА</span><h3 id="matchTitle">Матчи и назначения</h3><p>Время — Тбилиси, UTC+4. Откройте игру для статистики, игроков и арбитра.</p></div>
  <p className="definition">Календарь: ESPN · сегодня проверка не чаще раза в 5 минут, другие даты — 30 минут{stamp?' · '+day(new Date(stamp))+' '+time(stamp):''}. Архивные назначения UEFA повторно сверяются при открытии. Для остальных матчей данные запрашиваются при открытии. Пустое поле источника не означает отсутствие официального назначения. {favorites.storageError?'Не удалось сохранить избранное на устройстве; оно доступно только в этой сессии.':'Избранное сохраняется на этом устройстве.'}</p><RefereeDialog data={data} item={selected} onClose={()=>{token.current++;setSelected(null)}}/>
 </section>
}
