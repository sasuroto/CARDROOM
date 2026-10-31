'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useFavorites,FavoriteStar} from './favorites';
import {panelStatus,nextDelay,freshness,localKickoff,POLL} from '../lib/match-status';
import {matchSeeds,SEED_DAYS,SEED_UNTIL} from '../lib/followed-seed';
import MatchReport from './match-report';
import {refereeProfile} from './match-center';

// Persistent "My Matches" panel. Followed matches are the existing match favourites
// (localStorage, this browser only). Live data comes from /api/match, which proxies
// ESPN with a shared server cache; the client never calls ESPN directly.

const PREF_KEY='cardroom:my-matches-panel:v1',SEED_KEY='cardroom:my-matches-seed:v1',MAX=20;
type Entry={data:any|null,receivedAt:number|null,failed:boolean,failures:number,unsupported:boolean,retryAt:number|null,error:string|null};
const readJSON=(k:string)=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
const writeJSON=(k:string,v:unknown)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{/* private mode: preference not kept */}};
const isOffline=()=>typeof navigator!=='undefined'&&navigator.onLine===false;
const hhmm=(t:number|null)=>t?new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):null;

export default function MyMatchesPanel({data}:{data:any}){
 const fav=useFavorites(),followed=fav.items.filter(f=>f.kind==='match').slice(0,MAX);
 const [expanded,setExpanded]=useState(false),[prefReady,setPrefReady]=useState(false);
 const [entries,setEntries]=useState<Record<string,Entry>>({}),[online,setOnline]=useState(true),[lastSuccess,setLastSuccess]=useState<number|null>(null);
 const [seedInfo,setSeedInfo]=useState<any>(null),[selected,setSelected]=useState<any>(null),[now,setNow]=useState(0);
 const entriesRef=useRef<Record<string,Entry>>({}),timer=useRef<any>(null),running=useRef(false),panel=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null);
 const ids=followed.map(f=>f.id).join(',');
 const leagueName=(id?:string)=>data?.leagues?.find((l:any)=>l.id===id)?.name||id||'';

 useEffect(()=>{const p=readJSON(PREF_KEY);setExpanded(p?.expanded??window.matchMedia('(min-width:1000px)').matches);setPrefReady(true);setSeedInfo(readJSON(SEED_KEY));setOnline(navigator.onLine!==false);setNow(Date.now())},[]);
 useEffect(()=>{if(prefReady)writeJSON(PREF_KEY,{expanded})},[expanded,prefReady]);

 // One-time initial list: added only if the provider returns each fixture for the
 // right competition, teams and date. Missing fixtures are reported, not invented.
 useEffect(()=>{
  if(!fav.ready||Date.now()>Date.parse(SEED_UNTIL)||readJSON(SEED_KEY)?.done)return;
  const c=new AbortController();
  Promise.allSettled(SEED_DAYS.map(d=>fetch(`/api/matches?date=${d}&league=all`,{signal:c.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}))).then(results=>{
   if(c.signal.aborted)return;
   const events=results.flatMap(r=>r.status==='fulfilled'?((r.value as any).events||[]).filter((e:any)=>!e.stale):[]);
   const complete=results.every(r=>r.status==='fulfilled'&&!((r.value as any).errors||[]).length);
   const {found,missing}=matchSeeds(events);
   for(const {event} of found){const id=event.league+':'+event.id;if(!fav.has('match',id))fav.toggle('match',id,event.home+' — '+event.away,event.league)}
   const info={done:complete,at:new Date().toISOString(),found:found.map(f=>f.event.home+' — '+f.event.away),missing:missing.map(m=>m.home+' — '+m.away)};
   if(complete||found.length)writeJSON(SEED_KEY,info);setSeedInfo(info);
  }).catch(()=>{});
  return()=>c.abort();
 },[fav.ready]); // eslint-disable-line react-hooks/exhaustive-deps

 const commit=(next:Record<string,Entry>)=>{entriesRef.current=next;setEntries(next)};

 const tick=useCallback(async()=>{
  clearTimeout(timer.current);
  if(running.current)return;
  if(document.visibilityState==='hidden'||navigator.onLine===false){setOnline(navigator.onLine!==false);return}
  running.current=true;setNow(Date.now());
  const list=followed;let anyLive=false,anySoon=false,maxFailures=0,retryAt:number|null=null;
  for(const f of list){
   const [league,id]=f.id.split(':');const old=entriesRef.current[f.id]||{data:null,receivedAt:null,failed:false,failures:0,unsupported:false,retryAt:null,error:null};
   if(old.unsupported)continue;
   const status=panelStatus(old.data);
   // Terminal states need no polling once confirmed recently.
   if(old.data&&!old.failed&&!status.polls&&status.kind!=='scheduled'&&old.receivedAt&&Date.now()-old.receivedAt<POLL.idle)continue;
   if(old.data&&status.kind==='scheduled'&&old.receivedAt&&!old.failed){const k=Date.parse(old.data.date);if(Number.isFinite(k)&&k-Date.now()>15*60000&&Date.now()-old.receivedAt<POLL.idle)continue}
   if(old.retryAt&&old.retryAt>Date.now()){retryAt=Math.max(retryAt||0,old.retryAt);continue}
   let next:Entry={...old};
   try{
    const r=await fetch(`/api/match?id=${encodeURIComponent(id||'')}&league=${encodeURIComponent(league||'')}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(r.status===400){next={...old,unsupported:true,error:'Матч не поддерживается провайдером данных'}}
    else if(!r.ok){next={...old,failed:true,failures:old.failures+1,error:'Источник ответил ошибкой HTTP '+r.status}}
    else{
     const d:any=await r.json();
     const degraded=!!d.error||!!d.stale;
     const ra=d.rateLimited&&Number(d.retryAfter)>Date.now()?Number(d.retryAfter):null;
     if(degraded){next={...old,data:old.data&&!d.home?old.data:{...(old.data||{}),...d},failed:true,failures:old.failures+1,retryAt:ra,error:d.rateLimited?'Провайдер ограничил запросы':d.error||'Свежие данные не получены'};if(!old.receivedAt&&d.home)next.receivedAt=Date.now()}
     else{next={data:d,receivedAt:Date.now(),failed:false,failures:0,unsupported:false,retryAt:null,error:null};setLastSuccess(Date.now())}
    }
   }catch{next={...old,failed:true,failures:old.failures+1,error:isOffline()?'Нет соединения':'Сеть недоступна или запрос прерван'}}
   commit({...entriesRef.current,[f.id]:next});
   const s=panelStatus(next.data);if(s.kind==='live'||s.kind==='halftime')anyLive=true;
   const k=Date.parse(next.data?.date||'');if(s.kind==='scheduled'&&Number.isFinite(k)&&k-Date.now()<15*60000)anySoon=true;
   maxFailures=Math.max(maxFailures,next.failures);if(next.retryAt)retryAt=Math.max(retryAt||0,next.retryAt);
  }
  // Include already-known live states of entries skipped this round.
  for(const f of list){const s=panelStatus(entriesRef.current[f.id]?.data);if(s.kind==='live'||s.kind==='halftime')anyLive=true}
  running.current=false;
  if(list.length)timer.current=setTimeout(()=>tickRef.current(),nextDelay({anyLive,anySoon,failures:maxFailures,retryAt}));
 },[ids]); // eslint-disable-line react-hooks/exhaustive-deps
 const tickRef=useRef(tick);useEffect(()=>{tickRef.current=tick},[tick]);

 useEffect(()=>{if(!fav.ready)return;
  const known=new Set(followed.map(f=>f.id));commit(Object.fromEntries(Object.entries(entriesRef.current).filter(([k])=>known.has(k))));
  tick();
  const wake=()=>{setOnline(navigator.onLine!==false);if(document.visibilityState!=='hidden'&&navigator.onLine!==false)tick()};
  const offline=()=>{setOnline(false);clearTimeout(timer.current)};
  document.addEventListener('visibilitychange',wake);window.addEventListener('online',wake);window.addEventListener('offline',offline);
  const clock=setInterval(()=>setNow(Date.now()),15000);
  return()=>{clearTimeout(timer.current);clearInterval(clock);document.removeEventListener('visibilitychange',wake);window.removeEventListener('online',wake);window.removeEventListener('offline',offline)};
 },[fav.ready,tick]); // eslint-disable-line react-hooks/exhaustive-deps

 // Reserve space so the fixed panel never covers the end of the page.
 useEffect(()=>{const el=panel.current,root=document.documentElement;if(!el){root.style.removeProperty('--mm-panel-h');return}
  const set=()=>root.style.setProperty('--mm-panel-h',el.offsetHeight+16+'px');set();const ro=new ResizeObserver(set);ro.observe(el);return()=>{ro.disconnect();root.style.removeProperty('--mm-panel-h')};
 },[followed.length>0,expanded]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(()=>{if(!selected)return;const el=dialog.current;el?.showModal();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{el?.close();document.body.style.overflow=old}},[selected?.id]);

 if(!fav.ready||!followed.length)return null;
 const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const rows=followed.map(f=>{const e=entries[f.id],d=e?.data,s=panelStatus(d),fr=freshness(e||undefined,s,now);const [home,away]=(f.label||'').split(' — ');return {f,e,d,s,fr,home:d?.home||home||'—',away:d?.away||away||'—'}});
 const live=rows.filter(r=>(r.s.kind==='live'||r.s.kind==='halftime')&&r.fr==='current').length,stale=rows.some(r=>r.fr==='stale');
 return <div role="region" className={'mmPanel '+(expanded?'isExpanded':'isCompact')} aria-label="Мои матчи" onKeyDown={e=>{if(e.key==='Escape'&&expanded){setExpanded(false)}}}>
  <div className="mmInner" ref={panel}>
   <div className="mmBar">
    <span className="mmTitle"><FavoriteStar active/> Мои матчи <b>{followed.length}</b>{live>0&&<span className="mmLiveBadge">{live} LIVE</span>}</span>
    <span className="mmUpdated" aria-live="polite">{!online?'Нет соединения · показаны последние данные':lastSuccess?'Обновлено '+hhmm(lastSuccess)+(stale?' · часть данных устарела':''):'Загрузка…'}</span>
    <button type="button" className="mmToggle" aria-expanded={expanded} aria-controls="mm-list" onClick={()=>setExpanded(v=>!v)}>{expanded?'Свернуть':'Развернуть'}<span aria-hidden="true">{expanded?'▾':'▴'}</span></button>
   </div>
   <ul id="mm-list" className="mmList" tabIndex={0} aria-label="Отслеживаемые матчи — листайте">
    {rows.map(({f,e,d,s,fr,home,away})=>{const k=localKickoff(d?.date,tz),label=home+' — '+away;
     return <li key={f.id} className={'mmItem mm-'+s.kind+(fr==='stale'?' isStale':'')}>
      <div className="mmMeta"><span>{leagueName(f.league||d?.league)}</span><b className={s.kind==='live'&&fr==='current'?'mmLive':''}>{e?.unsupported?'Не поддерживается':s.kind==='scheduled'&&k?k.day+' · '+k.time:fr==='stale'&&(s.kind==='live'||s.kind==='halftime')?'Нет свежих данных':s.label}{s.minute&&s.kind!=='halftime'?' · '+s.minute:''}</b></div>
      <div className="mmTeams"><span>{home}</span><strong>{s.showScore&&d?.homeScore!=null&&d.homeScore!==''?d.homeScore:''}</strong><span>{away}</span><strong>{s.showScore&&d?.awayScore!=null&&d.awayScore!==''?d.awayScore:''}</strong></div>
      {expanded&&<p className="mmNote">{e?.unsupported?'Провайдер не отдаёт этот матч. Удалите его звездой.':!e?'Загрузка данных…':!d?(e.error||'Нет данных провайдера'):fr==='stale'?(s.showScore?'Последний известный счёт':'Последние известные данные')+(e.receivedAt?' · '+hhmm(e.receivedAt):'')+(e.error?' · '+e.error:''):s.kind==='scheduled'&&k?'Начало '+k.time+' · '+k.tz:s.kind==='live'?'Счёт в реальном времени · обновлено '+hhmm(e.receivedAt):'Обновлено '+hhmm(e.receivedAt)}</p>}
      <div className="mmActions">
       {expanded&&<button type="button" className="mmOpen" disabled={!d?.home} onClick={()=>setSelected({...d,id:f.id.split(':')[1],league:f.league||d.league})}>Разбор</button>}
       <button type="button" className="mmStar" aria-pressed="true" aria-label={'Убрать из «Моих матчей»: '+label} onClick={()=>fav.toggle('match',f.id,f.label,f.league)}><FavoriteStar active/></button>
      </div>
     </li>})}
   </ul>
   {expanded&&<p className="mmFoot">Список хранится только в этом браузере, без синхронизации между устройствами. Данные: ESPN через сервер CARDROOM; во время матча обновление каждые 30 с, при ошибках — с нарастающей паузой. Время: {tz}.{seedInfo?.missing?.length?' Не найдены у провайдера: '+seedInfo.missing.join(', ')+'.':''}{fav.items.filter(x=>x.kind==='match').length>MAX?` Показаны первые ${MAX}.`:''}</p>}
  </div>
  {selected&&<dialog ref={dialog} className="refDialog todayDialog" aria-label="Подробный разбор матча" onCancel={()=>setSelected(null)} onClick={ev=>{if(ev.target===ev.currentTarget)setSelected(null)}}><button className="heroClose" onClick={()=>setSelected(null)}>Закрыть ×</button><MatchReport key={selected.id} match={selected} data={data} profile={selected.referee?refereeProfile(selected.referee,selected.league,data):null}/></dialog>}
 </div>;
}
