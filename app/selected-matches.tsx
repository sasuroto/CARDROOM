'use client';
import {useEffect,useRef,useState} from 'react';
import {FavoriteStar,useFavorites} from './favorites';
import {mergeMatchStatus,statusCheckedAt,statusIsStale} from '../lib/match-status-evidence';
import {panelStatus,nextDelay} from '../lib/match-status';

const time=(value?:string)=>value?new Date(value).toLocaleTimeString('ru-RU',{timeZone:'Asia/Tbilisi',hour:'2-digit',minute:'2-digit'}):'—';
const dateTime=(value?:string)=>value?new Date(value).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';

export function mergeSelectedMatch(previous:any,next:any){
 if(!next||String(next.id)!==String(previous.id)||next.league!==previous.league)return previous;
 const result={...mergeMatchStatus(previous,next)};
 const observed=(value:unknown)=>typeof value==='string'?Date.parse(value):NaN;
 const atLeastAsNew=(incoming:unknown,current:unknown)=>Number.isFinite(observed(incoming))&&(!Number.isFinite(observed(current))||observed(incoming)>=observed(current));
 // date belongs to the accepted status snapshot. Never reapply an older kickoff
 // after mergeMatchStatus has already rejected that response.
 if(atLeastAsNew(next.fetchedAt,previous.fetchedAt))for(const field of ['home','away','homeLogo','awayLogo','source','fetchedAt'])if(next[field]!==undefined&&next[field]!==null)result[field]=next[field];
 // A dated, identity-checked saved fixture may seed an empty card, without
 // inventing status provenance or overwriting any newer existing metadata.
 if(Number.isFinite(observed(next.fetchedAt||next.checkedAt)))for(const field of ['home','away','date','homeLogo','awayLogo','source'])if((result[field]===undefined||result[field]===null||result[field]==='')&&typeof next[field]==='string'&&next[field]&&(field!=='date'||Number.isFinite(observed(next.date))))result[field]=next[field];
 const attempt=next.lastAttemptAt||next.statusLastAttemptAt||next.fetchedAt,previousAttempt=previous.lastAttemptAt||previous.statusLastAttemptAt||previous.fetchedAt;
 if(atLeastAsNew(attempt,previousAttempt)||!Number.isFinite(observed(attempt))&&(next.stale||next.error)){
  if(next.lastAttemptAt)result.lastAttemptAt=next.lastAttemptAt;
  result.error=next.error||'';result.stale=!!next.stale;result.rateLimited=!!next.rateLimited;
  if(next.appointmentStale)result.appointmentStale=true;
 }
 // An older response may extend a provider restriction, never shorten it.
 result.retryAfter=Math.max(Number(previous.retryAfter)||0,Number(next.retryAfter)||0)||undefined;
 if(atLeastAsNew(next.appointmentCheckedAt,previous.appointmentCheckedAt))for(const field of ['referee','refereeCountry','appointmentCheckedAt','appointmentSource','appointmentType','currentVerified','appointmentStale'])if(next[field]!==undefined&&next[field]!==null&&next[field]!=='')result[field]=next[field];

 return result;
}

export function selectedMatchStatus(match:any,now=Date.now()){
 const status=panelStatus(match,now);
 if(status.kind==='scheduled'&&match.date&&Date.parse(match.date)>=now)return time(match.date);
 if(status.kind!=='unavailable'&&status.kind!=='unknown')return status.label+(status.minute&&status.kind!=='halftime'?' · '+status.minute:'');
 return match.date?'Статус уточняется':match.error?'Нет данных':'Загружаю…';
}

export function selectedMatchFreshness(match:any,now=Date.now()){
 const timestamp=Date.parse(statusCheckedAt(match)||'');
 const fresh=!statusIsStale(match)&&Number.isFinite(timestamp)&&now-timestamp>=-60000&&now-timestamp<=120000;
 const hasScore=panelStatus(match,now).showScore&&[match.homeScore,match.awayScore].some(value=>value!==undefined&&value!==null&&value!=='');
 return {fresh,label:!fresh&&hasScore?'Последний известный счёт'+(Number.isFinite(timestamp)?' · '+time(statusCheckedAt(match)):''):(match.statusError||(!match.statusCheckedAt&&match.error))?'Обновление недоступно':!Number.isFinite(timestamp)?'Счёт ещё не подтверждён':!fresh?'Сохранено '+time(statusCheckedAt(match)):'Данные на '+time(statusCheckedAt(match))};
}

function Crest({src,name}:{src?:string;name:string}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);return src&&!failed?<img src={src} alt="" onError={()=>setFailed(true)}/>:<span className="selectedCrestFallback" aria-hidden="true">{name.slice(0,2)}</span>}

export default function SelectedMatches({data,onOpen}:{data:any;onOpen:(match:any)=>void}){
 const favorites=useFavorites(),chosen=favorites.items.filter(item=>item.kind==='match'&&item.league);
 const [matches,setMatches]=useState<Record<string,any>>({}),[refreshing,setRefreshing]=useState(false),[checkedAt,setCheckedAt]=useState(''),[failed,setFailed]=useState(0);
 const [expanded,setExpanded]=useState(false),[now,setNow]=useState(()=>Date.now()),[online,setOnline]=useState(true);
 useEffect(()=>{const sync=()=>setOnline(navigator.onLine!==false);sync();window.addEventListener('online',sync);window.addEventListener('offline',sync);const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setExpanded(false);try{localStorage.setItem('cardroom:selected-panel:expanded','false')}catch{}}};window.addEventListener('keydown',escape);return()=>{window.removeEventListener('online',sync);window.removeEventListener('offline',sync);window.removeEventListener('keydown',escape)}},[]);
 const refreshRef=useRef<()=>void>(()=>{}),matchesRef=useRef<Record<string,any>>({}),selectionKey=JSON.stringify(chosen.map(({id,league,label})=>({id,league,label})));
 useEffect(()=>{try{setExpanded(localStorage.getItem('cardroom:selected-panel:expanded')==='true')}catch{}const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer)},[]);
 const toggleExpanded=()=>setExpanded(old=>{try{localStorage.setItem('cardroom:selected-panel:expanded',String(!old))}catch{}return !old});
 useEffect(()=>{
  const chosen: Array<{id:string;league?:string;label:string}>=JSON.parse(selectionKey);
  const selected=new Set(chosen.map(item=>item.id));setMatches(old=>{const next=Object.fromEntries(Object.entries(old).filter(([id])=>selected.has(id)));matchesRef.current=next;return next});
  if(!chosen.length)return;
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|null=null,running=false,failures=0;
  const update=(id:string,value:any)=>setMatches(old=>{if(controller.signal.aborted)return old;const next={...old,[id]:value};matchesRef.current=next;return next});
  const schedule=()=>{
   if(controller.signal.aborted)return;
   const values=chosen.map(item=>matchesRef.current[item.id]).filter(Boolean),stamp=Date.now();
   // A first-load outage is not a confirmed idle/finished match. Retry in
   // the short recovery cadence until a provider status is actually known.
   const anyLive=values.length<chosen.length||values.some(match=>panelStatus(match,stamp).polls||panelStatus(match,stamp).kind==='unavailable'),anySoon=values.some(match=>panelStatus(match,stamp).kind==='scheduled'&&Number.isFinite(Date.parse(match.date||''))&&Date.parse(match.date)>=stamp&&Date.parse(match.date)-stamp<=15*60000);
   const retryAt=values.reduce((max,match)=>Math.max(max,Number(match.retryAfter)||0),0)||null;
   timer=setTimeout(refresh,nextDelay({anyLive,anySoon,failures:failures,retryAt}));
  };
  async function refresh(){
   if(timer)clearTimeout(timer);
   if(controller.signal.aborted||running||document.visibilityState==='hidden'||navigator.onLine===false)return;
   // Focus/manual retries must not bypass the provider's Retry-After.
   if(chosen.some(item=>Number(matchesRef.current[item.id]?.retryAfter)>Date.now())){schedule();return}
   running=true;setRefreshing(true);let errors=0;
   for(const item of chosen){
    if(controller.signal.aborted)break;
    const parts=item.id.split(':'),id=parts.at(-1)||'',league=item.league||parts[0];
    try{const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),response=await fetch(`/api/match?id=${encodeURIComponent(id)}&league=${encodeURIComponent(league)}`,{signal,cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const next:any=await response.json();if(!next||typeof next!=='object'||String(next.id)!==String(id)||next.league!==league)throw Error('Некорректный ответ матча');if(controller.signal.aborted)break;const merged=mergeSelectedMatch(matchesRef.current[item.id]||{id,league,label:item.label},next);update(item.id,merged);if(statusIsStale(next))errors++}catch(error:any){if(error.name!=='AbortError'&&!controller.signal.aborted){errors++;update(item.id,{...(matchesRef.current[item.id]||{id,league,label:item.label}),stale:true,error:'Не удалось обновить счёт',statusStale:true,statusError:'Не удалось обновить счёт'})}}
   }
   if(!controller.signal.aborted){failures=errors?failures+1:0;setFailed(errors);setCheckedAt(new Date().toISOString());setRefreshing(false)}running=false;schedule();
  }
  refreshRef.current=()=>{void refresh()};
  const resume=()=>{if(document.visibilityState==='visible'&&navigator.onLine!==false)refresh()},offline=()=>{if(timer)clearTimeout(timer)};refresh();window.addEventListener('focus',resume);window.addEventListener('online',resume);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',resume);
  return()=>{controller.abort();refreshRef.current=()=>{};if(timer)clearTimeout(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',resume);running=false};
 },[selectionKey]);

 if(!favorites.ready||!chosen.length)return null;
 const restricted=chosen.some(item=>Number(matches[item.id]?.retryAfter)>now);
 return <section className={'selectedMatches selectedMatchesPinned'+(expanded?' isExpanded':' isCompact')} aria-labelledby="selected-matches-title" aria-busy={refreshing}>
  <div className="selectedMatchesHead"><div><span className="eyebrow">МОИ МАТЧИ</span><h2 id="selected-matches-title">Мои матчи <span>· {chosen.length}</span></h2><p>Сохраняются на этом устройстве · live-счёт каждые 30 с, при ошибках — реже</p></div><div className="selectedPanelActions"><button type="button" disabled={refreshing||!online||restricted} onClick={()=>refreshRef.current()} aria-label="Повторить проверку матчей" title={restricted?'Ожидаем разрешённого источником времени повтора':undefined}>Обновить</button><button type="button" onClick={toggleExpanded} aria-expanded={expanded} aria-controls="selected-matches-grid">{expanded?'Свернуть ↑':'Подробнее ↓'}</button><small>{refreshing?'Проверяю…':checkedAt?'Последняя попытка '+dateTime(checkedAt):'Ожидает проверки'}</small></div></div>
  {!online&&<p className="selectedMatchesNotice" role="status">Нет соединения. Показаны последние сохранённые данные; после восстановления сети проверка продолжится.</p>}
  {favorites.storageError&&<p className="selectedMatchesNotice" role="status">Браузер не позволяет сохранить выбор. После закрытия он может потеряться.</p>}
  {failed>0&&<p className="selectedMatchesNotice" role="status">Не удалось подтвердить {failed} {failed===1?'матч':'матча/матчей'}. Сохранённые значения и прочерки не заменены нулями.</p>}
  <div id="selected-matches-grid" className="selectedMatchesGrid" aria-label="Выбранные матчи, прокрутка в сторону">{chosen.map(item=>{const parts=item.id.split(':'),match=matches[item.id]||{id:parts.at(-1),league:item.league||parts[0],label:item.label},state=panelStatus(match,now),played=state.showScore,status=selectedMatchStatus(match,now),freshness=selectedMatchFreshness(match,now),names=String(item.label).split(' — '),home=match.home||names[0]||'Матч',away=match.away||names[1]||'';return <article key={item.id} className={'selectedMatchCard '+(state.polls&&freshness.fresh?'isLive':'')}>
   <button className="selectedMatchOpen" onClick={()=>match.home&&match.away&&onOpen(match)} disabled={!match.home||!match.away} aria-label={`${home} — ${away}. ${status}. ${match.referee?'Арбитр: '+match.referee:match.state==='post'?'Имя арбитра не получено из источника':'Назначение арбитра уточняется'}. Открыть матч`}><span className="selectedMatchMeta"><span>{data.leagues.find((league:any)=>league.id===match.league)?.name||match.league}</span><b>{status}</b></span><span className={'selectedFreshness '+(!freshness.fresh?'isStale':'')}>{freshness.label}</span>{match.statusWarning&&<span className="selectedFreshness isStale">{match.statusWarning}</span>}<span className="selectedTeam"><Crest src={match.homeLogo} name={home}/><span>{home}</span><strong>{played?match.homeScore??'—':''}</strong></span><span className="selectedTeam"><Crest src={match.awayLogo} name={away}/><span>{away}</span><strong>{played?match.awayScore??'—':''}</strong></span><span className={'selectedReferee '+(match.referee?'hasReferee':'')}><span>Арбитр</span><b>{match.referee||(match.state==='post'?'Имя не получено':match.lastAttemptAt?'Назначение уточняется':'Проверяю…')}</b></span></button>
   <button className="selectedMatchRemove" aria-label={'Убрать с главного экрана: '+item.label} onClick={()=>favorites.toggle('match',item.id,item.label,item.league)}><FavoriteStar active/></button>
  </article>})}</div>
 </section>;
}
