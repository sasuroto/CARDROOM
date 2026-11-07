'use client';
import {useEffect,useRef,useState} from 'react';
import snapshot from '../lib/fixture-snapshot.json';
import {withAppointment} from '../lib/fixture-display';
import {calendarDay as day} from '../lib/calendar-scope';
import {dailyMatches,dailyStatus,dailyStamp,mergeDailyMatches} from '../lib/daily-strip';
import MatchReport from './match-report';
import {refereeProfile} from './match-center';
import {FavoriteStar,useFavorites} from './favorites';
function Crest({src,name}:{src?:string,name:string}){const [broken,setBroken]=useState(false);useEffect(()=>setBroken(false),[src]);return src&&!broken?<img src={src} alt="" onError={()=>setBroken(true)}/>:<span className="dailyCrestFallback" aria-hidden="true">{name.slice(0,2)}</span>}
export default function TodayMatches({data,league='all'}:{data:any,league?:string}){
 const favorites=useFavorites();
 const [now,setNow]=useState(()=>Date.now()),[failed,setFailed]=useState(false);
 const [today,setToday]=useState(day),[events,setEvents]=useState<any[]>(()=>dailyMatches(snapshot.events,day(),league,Date.now())),[loading,setLoading]=useState(true),[error,setError]=useState(''),[stamp,setStamp]=useState(''),[selected,setSelected]=useState<any>(null),[reload,setReload]=useState(0);
 const track=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),opening=useRef<AbortController|null>(null),initial=useRef(true);
 useEffect(()=>{const t=setInterval(()=>{setNow(Date.now());setToday(day())},15000);return()=>clearInterval(t)},[]);
 useEffect(()=>{
  const c=new AbortController();let pending=false;
  // Serial polling prevents a slow older response from replacing a newer one.
  async function update(){
   if(pending||c.signal.aborted)return;
   pending=true;setLoading(true);
   try{
    const r=await fetch(`/api/matches?date=${today}&league=${league}`,{signal:c.signal});if(!r.ok)throw Error();
    const d:any=await r.json();if(c.signal.aborted)return;
    if(!Array.isArray(d.events))throw Error();
    setEvents(previous=>dailyMatches(mergeDailyMatches(previous,d.events,Array.isArray(d.errors)?d.errors:[],d.lastAttempt||d.checkedAt),today,league,Date.now()));setStamp(d.lastAttempt||d.checkedAt||'');setFailed(false);setNow(Date.now());
    setError(d.errors?.length?'Часть источников недоступна. Календарь может быть неполным.':'');
    if(initial.current){initial.current=false;requestAnimationFrame(()=>track.current?.scrollTo({left:0}))}
   }catch{if(!c.signal.aborted){setFailed(true);setError('Обновление недоступно. Показан сохранённый срез.');setNow(Date.now())}}
   finally{pending=false;if(!c.signal.aborted)setLoading(false)}
  }
  update();const t=setInterval(update,5*60000);return()=>{c.abort();clearInterval(t)}
 },[today,league,reload]);
 useEffect(()=>{if(!selected)return;const el=dialog.current;el?.showModal();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{el?.close();document.body.style.overflow=old}},[selected?.id]);
 useEffect(()=>()=>opening.current?.abort(),[]);
 function close(){opening.current?.abort();setSelected(null)}
 async function open(m:any){opening.current?.abort();const c=new AbortController();opening.current=c;setSelected(m);try{const r=await fetch(`/api/match?id=${m.id}&league=${m.league}`,{signal:c.signal});if(!r.ok)throw Error();const a=await r.json();if(!c.signal.aborted)setSelected(withAppointment(m,a))}catch{/* MatchReport shows its own appointment check and honest fallback. */}}
 function move(direction:number){const el=track.current;if(el)el.scrollBy({left:direction*239,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
 const visible=dailyMatches(events,today,league,now);
 return <section id="today-matches" className="dailyBar" aria-label="Сегодняшние матчи" aria-busy={loading}><div className="dailyBarHead"><div><h2>Сегодня на поле</h2><span>{new Date(today+'T12:00:00+04:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'Asia/Tbilisi'})} · Тбилиси, UTC+4</span></div><div className="dailyBarControls"><small>{loading?'Проверяю…':stamp?'Попытка календаря · '+dailyStamp(stamp):'Сохранённый календарь'}</small><button aria-label="Обновить сегодняшние матчи" disabled={loading} onClick={()=>setReload(n=>n+1)}>↻</button><button aria-label="Предыдущие матчи" onClick={()=>move(-1)}>←</button><button aria-label="Следующие матчи" onClick={()=>move(1)}>→</button></div></div>{error&&<p className="dailyNotice" role="status">{error}</p>}<div className="dailyTrack" ref={track} tabIndex={0} aria-label="Сегодняшние игры — листайте вбок" onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){e.preventDefault();move(e.key==='ArrowRight'?1:-1)}}}>{visible.map(m=>{const evidence=dailyStatus(m,now,failed),played=evidence.showScore,status=evidence.label,favoriteId=m.league+':'+m.id,isFavorite=favorites.has('match',favoriteId);return <article key={favoriteId} className={'dailyMatch '+(evidence.live?'isLive':'')}><button className="dailyMatchOpen" onClick={()=>open(m)} aria-label={`${m.home} — ${m.away}. ${status}. ${evidence.provenance}. Открыть матч`}><span className="dailyMatchMeta"><span>{data.leagues.find((l:any)=>l.id===m.league)?.name||m.league}</span><b>{status}</b></span><span className="dailyTeam"><Crest src={m.homeLogo} name={m.home}/><span>{m.home}</span><b>{played?m.homeScore??'—':''}</b></span><span className="dailyTeam"><Crest src={m.awayLogo} name={m.away}/><span>{m.away}</span><b>{played?m.awayScore??'—':''}</b></span><small className="dailyProvenance">{evidence.provenance}</small></button><button className="dailyFavorite" disabled={!favorites.ready} aria-pressed={isFavorite} aria-label={`${isFavorite?'Убрать с главного экрана':'Добавить на главный экран'}: ${m.home} — ${m.away}`} onClick={()=>favorites.toggle('match',favoriteId,m.home+' — '+m.away,m.league)}><FavoriteStar active={isFavorite}/></button></article>})}{!visible.length&&<p className="dailyEmpty">{loading?'Загружаю сегодняшние игры…':error?'Расписание не получено. Повторите проверку позже.':'Сегодня игр в полученном расписании нет. Ближайшие встречи — внутри турниров ниже.'}</p>}</div><p className="dailyHint">Все турниры · звезда добавляет матч на главный экран · live-счёт выбранных игр проверяется каждые 30 с, при ошибках — реже</p>{selected&&<dialog ref={dialog} className="refDialog todayDialog" aria-label="Подробный разбор матча" onCancel={close} onClick={e=>{if(e.target===e.currentTarget)close()}}><button className="heroClose" onClick={close}>Закрыть ×</button><MatchReport key={selected.id} match={selected} data={data} profile={selected.referee?refereeProfile(selected.referee,selected.league,data):null}/></dialog>}</section>
}
