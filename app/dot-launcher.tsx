'use client';
import {useEffect,useRef,useState} from 'react';
import {calendarDay} from '../lib/calendar-scope';
import MatchReport from './match-report';

export function dotPickerMatches(events:any[],date:string,query:string,league:string){
 const q=query.trim().toLocaleLowerCase();
 return events.filter(m=>m?.id&&m?.home&&m?.away&&Number.isFinite(Date.parse(m.date))&&calendarDay(new Date(m.date))===date&&(league==='all'||m.league===league)&&(!q||(m.home+' '+m.away).toLocaleLowerCase().includes(q))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}
export default function DotLauncher({data}:{data:any}){
 const [open,setOpen]=useState(false),[date,setDate]=useState(calendarDay),[query,setQuery]=useState(''),[league,setLeague]=useState('all');
 const [events,setEvents]=useState<any[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState<any>(null),[retry,setRetry]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;const el=dialog.current;el?.showModal();const before=document.body.style.overflow;document.body.style.overflow='hidden';
  el?.querySelector<HTMLInputElement>('input[type=search]')?.focus();
  return()=>{el?.close();document.body.style.overflow=before;trigger.current?.focus()};
 },[open]);
 useEffect(()=>{
  if(!open||selected)return;const controller=new AbortController();setLoading(true);setError('');setEvents([]);
  fetch('/api/matches?league=all&date='+encodeURIComponent(date),{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then((d:any)=>{
   if(controller.signal.aborted)return;
   if(!Array.isArray(d.events))throw Error();setEvents(d.events);
   if(d.errors?.length||d.stale)setError('Календарь неполный или сохранённый. Доступность DOT проверяется отдельно внутри матча.');
  }).catch(e=>{if(e.name!=='AbortError'&&!controller.signal.aborted)setError('Расписание недоступно. Повторите проверку позже.')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>controller.abort();
 },[open,date,retry,selected]);
 useEffect(()=>{
  if(!open||!selected)return;
  const frame=requestAnimationFrame(()=>{const block=dialog.current?.querySelector<HTMLElement>('.dotPredict');block?.scrollIntoView({block:'start'});block?.focus({preventScroll:true})});
  return()=>cancelAnimationFrame(frame);
 },[open,selected]);
 const games=dotPickerMatches(events,date,query,league);
 function launch(){setDate(calendarDay());setSelected(null);setQuery('');setLeague('all');setEvents([]);setLoading(true);setError('');setOpen(true)}
 return <><button ref={trigger} type="button" className="dotLaunch" onClick={launch} aria-haspopup="dialog" aria-label="Открыть DOT Predict">DOT <span>Predict</span></button>
 {open&&<dialog ref={dialog} className="refDialog dotPicker" aria-labelledby="dot-picker-title" onCancel={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
  <div className="dotPickerToolbar"><h2 id="dot-picker-title">DOT Predict</h2><div>{selected&&<button type="button" onClick={()=>{setSelected(null);dialog.current?.scrollTo({top:0})}}>← Выбрать матч</button>}<button type="button" onClick={()=>setOpen(false)} aria-label="Закрыть DOT Predict">Закрыть ×</button></div></div>
  {selected?<div className="dotPickerReport"><MatchReport key={selected.league+':'+selected.id} match={selected} data={data} profile={null}/></div>:<div className="dotPickerBody">
   <p>Выберите матч — откроется его DOT-разбор. Список не является подборкой ставок. Для идущих и завершённых игр предматчевые сценарии отключены.</p>
   <div className="dotPickerFilters"><label>Дата · Тбилиси, UTC+4<input type="date" min="2025-01-01" max="2028-12-31" value={date} onChange={e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))setDate(e.target.value)}}/></label><label>Турнир<select value={league} onChange={e=>setLeague(e.target.value)}><option value="all">Все турниры</option>{data.leagues.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Команда<input type="search" value={query} placeholder="Название команды…" onChange={e=>setQuery(e.target.value)}/></label><button type="button" disabled={loading} onClick={()=>setRetry(n=>n+1)}>Обновить</button></div>
   {error&&<p className="notice" role="status">{error}</p>}
   {loading?<p role="status">Загружаю матчи…</p>:<div className="dotPickerGames">{games.map(m=><button type="button" key={m.league+':'+m.id} onClick={()=>setSelected(m)}><span>{data.leagues.find((l:any)=>l.id===m.league)?.name||m.league} · {new Date(m.date).toLocaleTimeString('ru-RU',{timeZone:'Asia/Tbilisi',hour:'2-digit',minute:'2-digit'})}</span><strong>{m.home} — {m.away}</strong><small>Открыть DOT-разбор →</small></button>)}{!games.length&&<p>{error?'Матчи по выбранным условиям не получены.':'В полученном расписании нет матчей по выбранным условиям.'}</p>}</div>}
   <p className="definition">Экспериментальная модель. Наличие матча в списке не означает, что данных достаточно для прогноза.</p>
  </div>}
 </dialog>}</>;
}
