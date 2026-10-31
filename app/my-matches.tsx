'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {withAppointment} from '../lib/fixture-display';
import {appointmentState,STATE_LABEL} from '../lib/referee-authority';
import {calendarDay as day} from '../lib/calendar-scope';
import {TrackerState,TrackedFixture,Selection,Market,SelectionStatus,initialTracker,sanitizeState,marketLabel,settleSelection,settleAccumulator,slipReturn,addFixture,addSelection,removeFixture,resolveFixture,findMatch} from '../lib/selection-tracker';
import MatchReport from './match-report';
import {FavoriteButton} from './favorites';
import {refereeProfile} from './match-center';

const KEY='cardroom:my-matches:v1';
const TZ='Asia/Tbilisi';
const time=(s?:string)=>s&&Number.isFinite(Date.parse(s))?new Date(s).toLocaleString('ru-RU',{timeZone:TZ,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Время уточняется';
const money=(v:number|null|undefined)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const dec=(v:number|null|undefined)=>typeof v==='number'?v.toFixed(2).replace('.',','):'—';
const STATUS_RU:Record<SelectionStatus,string>={pending:'Ожидает',won:'Выиграла',lost:'Проиграла',void:'Возврат',unknown:'Нужна проверка'};
const plural=(n:number,[one,few,many]:string[])=>{const a=n%10,b=n%100;return n+' '+(a===1&&b!==11?one:a>=2&&a<=4&&(b<12||b>14)?few:many)};
const LEAGUE_IDS=['epl','ucl','laliga','segunda','seriea','bundesliga','ligue1','superlig','primeira'];

function load():TrackerState{try{return sanitizeState(JSON.parse(localStorage.getItem(KEY)||'null'))||initialTracker()}catch{return initialTracker()}}
function statusText(m:any){
 if(!m)return 'Нет данных календаря';
 if(/POSTPONED/.test(m.statusName||''))return 'Перенесён';
 if(/SUSPENDED|ABANDONED/.test(m.statusName||''))return 'Прерван';
 if(/CANCEL/.test(m.statusName||''))return 'Отменён';
 if(m.state==='in')return 'LIVE'+(m.clock?' · '+m.clock:'')+(m.statusDetail==='HT'?' · перерыв':'');
 if(m.state==='post')return m.statusDetail&&m.statusDetail!=='FT'?'Завершён · '+m.statusDetail:'Завершён';
 return Date.parse(m.date)<Date.now()?'Статус уточняется':'Предстоит';
}

export default function MyMatches({data}:{data:any}){
 const [state,setState]=useState<TrackerState>(initialTracker),[ready,setReady]=useState(false),[account,setAccount]=useState<'unknown'|'device'|'account'>('unknown');
 const [events,setEvents]=useState<Record<string,any>>({}),[details,setDetails]=useState<Record<string,any>>({}),[checkedAt,setCheckedAt]=useState(''),[feedError,setFeedError]=useState('');
 const [health,setHealth]=useState<any>(null),[message,setMessage]=useState(''),[showForm,setShowForm]=useState(false),[picked,setPicked]=useState<string[]>([]),[selected,setSelected]=useState<any>(null);
 const dialog=useRef<HTMLDialogElement>(null),saveTimer=useRef<any>(null);
 const leagueName=(id:string)=>data.leagues.find((l:any)=>l.id===id)?.name||id;

 // Device storage first, then the signed-in account (if the Sites edge provides one).
 useEffect(()=>{const local=load();setState(local);setReady(true);
  fetch('/api/my-matches',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();const d:any=await r.json();if(!d.signedIn){setAccount('device');return}setAccount('account');const remote=sanitizeState(d.state);if(remote&&Date.parse(remote.updatedAt)>Date.parse(local.updatedAt))setState(remote)}).catch(()=>setAccount('device'));
 },[]);
 useEffect(()=>{if(!ready)return;try{localStorage.setItem(KEY,JSON.stringify(state))}catch{setMessage('Браузер не позволяет сохранить список на этом устройстве.')}
  if(account!=='account')return;clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>{fetch('/api/my-matches',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)}).catch(()=>setMessage('Синхронизация с аккаунтом не удалась; список сохранён на устройстве.'))},800);
 },[state,ready,account]);

 const days=useMemo(()=>[...new Set(state.fixtures.flatMap(f=>[...f.days,...(f.date?[day(new Date(f.date))]:[])]))].sort(),[state.fixtures]);
 const [clock,setClock]=useState(0);
 useEffect(()=>{const tick=()=>setClock(Date.now());tick();const t=setInterval(tick,30000);return()=>clearInterval(t)},[]);
 const live=useMemo(()=>state.fixtures.some(f=>{const e=findMatch(f,Object.values(events));return e?.state==='in'||(!!e&&!!clock&&e.state==='pre'&&Date.parse(e.date)-clock<15*60000)}),[state.fixtures,events,clock]);

 // Calendar per day (server-cached), plus per-match summaries for live fixtures.
 useEffect(()=>{if(!ready||!days.length)return;const c=new AbortController();
  async function update(){
   const results=await Promise.allSettled(days.map(d=>fetch(`/api/matches?date=${d}&league=all`,{signal:c.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})));
   if(c.signal.aborted)return;const next:Record<string,any>={};let failed=0,partial=false;
   for(const r of results){if(r.status==='fulfilled'){for(const e of (r.value as any).events||[])next[e.league+':'+e.id]=e;if((r.value as any).errors?.length)partial=true}else failed++}
   setEvents(old=>({...old,...next}));setCheckedAt(new Date().toISOString());
   setFeedError(failed?'Календарь частично недоступен; показаны последние полученные данные.':partial?'Часть турниров временно недоступна в источнике.':'');
  }
  update();const t=setInterval(()=>{if(document.visibilityState!=='hidden')update()},live?60000:5*60000);return()=>{c.abort();clearInterval(t)};
 },[ready,days.join(','),live]); // eslint-disable-line react-hooks/exhaustive-deps

 const matches=useMemo(()=>Object.fromEntries(state.fixtures.map(f=>{const e=findMatch(f,Object.values(events));const d=e&&details[e.league+':'+e.id];return [f.key,e?mergeDetail(e,d):undefined]})),[state.fixtures,events,details]);

 // Attach resolved IDs once, so the fixture keeps one stable identity.
 useEffect(()=>{for(const f of state.fixtures){const m=matches[f.key];if(m&&(f.espnId!==String(m.id)||f.date!==m.date))setState(s=>resolveFixture(s,f.key,m))}},[matches]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(()=>{if(!ready)return;const c=new AbortController();
  async function refresh(){const targets=state.fixtures.map(f=>matches[f.key]).filter(m=>m&&(m.state==='in'||(m.state==='post'&&!details[m.league+':'+m.id])||(m.state==='pre'&&Date.parse(m.date)-Date.now()<3*3600000)));
   for(const m of targets){try{const r=await fetch(`/api/match?id=${m.id}&league=${m.league}`,{signal:c.signal,cache:'no-store'});if(!r.ok)continue;const d=await r.json();if(!c.signal.aborted)setDetails(old=>({...old,[m.league+':'+m.id]:d}))}catch{/* calendar values stay visible */}}}
  refresh();const t=setInterval(()=>{if(document.visibilityState!=='hidden')refresh()},60000);return()=>{c.abort();clearInterval(t)};
 },[ready,Object.values(matches).map((m:any)=>m?m.id+m.state:'').join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(()=>{fetch('/api/source-health',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(setHealth).catch(()=>setHealth(null))},[]);
 useEffect(()=>{if(!selected)return;const el=dialog.current;el?.showModal();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{el?.close();document.body.style.overflow=old}},[selected?.id]);

 const update=(fn:(s:TrackerState)=>TrackerState)=>setState(s=>fn(s));
 const patchSel=(id:string,patch:Partial<Selection>)=>update(s=>({...s,selections:s.selections.map(x=>x.id===id?{...x,...patch}:x),updatedAt:new Date().toISOString()}));
 const settle=(sel:Selection)=>settleSelection(sel,matches[sel.fixtureKey]);
 const pickedSel=state.selections.filter(s=>picked.includes(s.id));
 const sameFixtureInSlip=new Set(pickedSel.map(s=>s.fixtureKey)).size<pickedSel.length;

 function remove(f:TrackedFixture){update(s=>removeFixture(s,f.key));setPicked(p=>p.filter(id=>state.selections.find(s=>s.id===id)?.fixtureKey!==f.key));setMessage(`${f.home} — ${f.away}: матч и его выборы удалены.`)}
 function createAcca(){if(pickedSel.length<2)return;update(s=>({...s,accumulators:[...s.accumulators,{id:'acc-'+Date.now(),selectionIds:pickedSel.map(x=>x.id),stake:null,createdAt:new Date().toISOString()}],updatedAt:new Date().toISOString()}));setPicked([]);setMessage('Экспресс создан.')}
 function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget),g=(k:string)=>String(fd.get(k)||'').trim();
  const league=g('league'),home=g('home'),away=g('away'),date=g('date'),result=g('result'),side=g('side'),line=Number(g('line').replace(',','.')),odds=g('odds')?Number(g('odds').replace(',','.')):null,stake=g('stake')?Number(g('stake').replace(',','.')):null;
  if(!LEAGUE_IDS.includes(league)||home.length<2||away.length<2||!/^\d{4}-\d{2}-\d{2}$/.test(date)){setMessage('Укажите турнир, обе команды и дату.');return}
  const market:Market={...(result?{result:result as any}:{}),...(side?{total:{side:side as 'over'|'under',line}}:{})};
  let next=state;const added=addFixture(next,{league,home,away,days:[date]});next=added.state;
  const res=addSelection(next,{fixtureKey:added.fixture.key,market,odds,stake,manualStatus:null});
  if(!res.added){setState(next);setMessage(res.reason==='duplicate'?'Такой выбор на этот матч уже есть — дубль не добавлен.':'Проверьте рынок: исход и/или тотал (линия .5), коэффициент > 1.');return}
  setState(res.state);setMessage(added.duplicate?'Матч уже в списке — выбор добавлен к нему.':'Матч добавлен.');e.currentTarget.reset();setShowForm(false)}

 const totalStake=state.selections.reduce((s,x)=>s+(x.stake||0),0);
 return <section className="myMatches" id="my-selections" aria-labelledby="myMatchesTitle">
  <div className="myMatchesHead"><div><span className="eyebrow">MY SELECTIONS / МОИ ВЫБОРЫ</span><h2 id="myMatchesTitle">Мои выборы</h2><p>{plural(state.fixtures.length,['матч','матча','матчей'])} · время по Тбилиси (UTC+4) · {account==='account'?'сохраняется в аккаунте':'сохраняется на этом устройстве'}{checkedAt?' · обновлено '+new Date(checkedAt).toLocaleTimeString('ru-RU',{timeZone:TZ,hour:'2-digit',minute:'2-digit'}):''}</p></div>
   <div className="myMatchesActions"><button type="button" className="myBtn primary" onClick={()=>setShowForm(v=>!v)} aria-expanded={showForm}>{showForm?'Закрыть форму':'+ Добавить матч'}</button>{picked.length>1&&<button type="button" className="myBtn" onClick={createAcca}>Экспресс из {picked.length}</button>}</div></div>
  {showForm&&<form className="myForm" onSubmit={submit} aria-label="Добавить матч и выбор">
   <label>Турнир<select name="league" defaultValue="epl">{LEAGUE_IDS.map(id=><option key={id} value={id}>{leagueName(id)}</option>)}</select></label>
   <label>Хозяева<input name="home" required maxLength={60} autoComplete="off"/></label>
   <label>Гости<input name="away" required maxLength={60} autoComplete="off"/></label>
   <label>Дата (Тбилиси)<input name="date" type="date" required defaultValue={day()}/></label>
   <label>Исход<select name="result" defaultValue=""><option value="">—</option><option value="1">П1</option><option value="X">X</option><option value="2">П2</option><option value="1X">1X</option><option value="X2">X2</option><option value="12">12</option></select></label>
   <label>Тотал<select name="side" defaultValue=""><option value="">—</option><option value="over">Больше</option><option value="under">Меньше</option></select></label>
   <label>Линия<input name="line" inputMode="decimal" defaultValue="2.5"/></label>
   <label>Коэффициент<input name="odds" inputMode="decimal" placeholder="1.50"/></label>
   <label>Ставка<input name="stake" inputMode="decimal" placeholder="необязательно"/></label>
   <button className="myBtn primary" type="submit">Сохранить</button></form>}
  {message&&<p className="myNote" role="status">{message}</p>}
  {feedError&&<p className="myNote warn" role="status">{feedError}</p>}
  <div className="myGrid">{state.fixtures.map(f=>{const m=matches[f.key],sels=state.selections.filter(s=>s.fixtureKey===f.key),played=m&&(m.state==='in'||m.state==='post'),rs=m?appointmentState(m):'unavailable';
   return <article key={f.key} className="myCard" aria-label={`${f.home} — ${f.away}`}>
    <div className="myCardTop"><span>{m&&<span className="myFollow"><FavoriteButton kind="match" id={m.league+':'+m.id} label={m.home+' — '+m.away} league={m.league}/></span>}{leagueName(f.league)} · {time(m?.date||f.date)}</span><b className={m?.state==='in'?'myLive':''}>{statusText(m)}</b></div>
    <div className="myTeams"><span>{m?.homeLogo&&<img src={m.homeLogo} alt=""/>}<b>{m?.home||f.home}</b></span><strong>{played?m.homeScore??'—':''}</strong><span>{m?.awayLogo&&<img src={m.awayLogo} alt=""/>}<b>{m?.away||f.away}</b></span><strong>{played?m.awayScore??'—':''}</strong></div>
    <p className="myMeta">Арбитр: {m?.referee||'нет данных'}{m?.referee?' · '+STATE_LABEL[rs].label:''}{m?.appointmentConflict?' · есть расхождение источников':''}{m?.stale?' · данные из сохранённого среза':''}</p>
    {sels.map(s=>{const r=settle(s);return <div key={s.id} className="mySel"><label style={{display:'flex',gap:6,alignItems:'center'}}><input type="checkbox" checked={picked.includes(s.id)} onChange={e=>setPicked(p=>e.target.checked?[...p,s.id]:p.filter(x=>x!==s.id))} aria-label={'Добавить в экспресс: '+marketLabel(s.market)}/><b>{marketLabel(s.market)}</b></label><span>@ {dec(s.odds)}</span><span className={'myStatus '+r.status}>{STATUS_RU[r.status]}</span>
     <small>{r.reason}{s.stake?` · ставка ${money(s.stake)} · возврат ${money(slipReturn([s.odds],s.stake).potentialReturn)} · прибыль ${money(slipReturn([s.odds],s.stake).netProfit)}`:''}</small>
     <details className="myEdit"><summary>Ставка и ручной расчёт</summary><div><select aria-label="Расчёт выбора" value={s.manualStatus||''} onChange={e=>patchSel(s.id,{manualStatus:(e.target.value||null) as any})}><option value="">Авто</option><option value="won">Выиграла</option><option value="lost">Проиграла</option><option value="void">Возврат</option></select>
     <input aria-label="Ставка" inputMode="decimal" placeholder="ставка" defaultValue={s.stake??''} onBlur={e=>{const v=e.target.value.trim()?Number(e.target.value.replace(',','.')):null;if(v===null||(Number.isFinite(v)&&v>0))patchSel(s.id,{stake:v})}} style={{width:90}}/></div></details>
    </div>})}
    <div className="myCardLinks"><button type="button" disabled={!m} onClick={()=>m&&setSelected(m)}>Полный разбор матча →</button><button type="button" className="remove" onClick={()=>remove(f)}>Убрать</button></div>
   </article>})}</div>
  {!state.fixtures.length&&<p className="myNote">Список пуст. Добавьте матч кнопкой выше.</p>}
  {state.accumulators.length>0&&<div className="myAcc"><h3>Экспрессы</h3>{state.accumulators.map(a=>{const legs=a.selectionIds.map(id=>state.selections.find(s=>s.id===id)).filter(Boolean) as Selection[];const res=settleAccumulator(legs.map(l=>({status:settle(l).status,odds:l.odds})),a.stake);const linked=new Set(legs.map(l=>l.fixtureKey)).size<legs.length;
   return <div key={a.id} className="myAccRow"><b>{legs.map(l=>{const f=state.fixtures.find(x=>x.key===l.fixtureKey);return `${f?.home||''}: ${marketLabel(l.market)}`}).join(' · ')}</b><span>Кэф {dec(res.combined)}</span><span className={'myStatus '+res.status}>{STATUS_RU[res.status]}</span><input aria-label="Ставка на экспресс" inputMode="decimal" placeholder="ставка" defaultValue={a.stake??''} onBlur={e=>{const v=e.target.value.trim()?Number(e.target.value.replace(',','.')):null;if(v===null||(Number.isFinite(v)&&v>0))update(s=>({...s,accumulators:s.accumulators.map(x=>x.id===a.id?{...x,stake:v}:x),updatedAt:new Date().toISOString()}))}}/><span>Возврат {money(res.potentialReturn)} · прибыль {money(res.netProfit)}</span>{res.settledReturn!==null&&<span>Итог: {money(res.settledReturn)}</span>}{linked&&<span className="myNote warn">Несколько выборов на один матч — связанные исходы; букмекер может не принять такой экспресс.</span>}<button type="button" className="myBtn" onClick={()=>update(s=>({...s,accumulators:s.accumulators.filter(x=>x.id!==a.id),updatedAt:new Date().toISOString()}))}>Удалить</button></div>})}</div>}
  {sameFixtureInSlip&&<p className="myNote warn">В выбранных есть два исхода одного матча — это связанные события.</p>}
  <p className="myNote">Коэффициенты внесены вручную как справочные значения, это не живые цены букмекера. Выбор засчитывается автоматически только по подтверждённому итоговому счёту основного времени; переносы, прерванные матчи и неполные данные остаются на проверку. Экспресс не считается выигранным, пока не рассчитаны все выборы.{totalStake?` Сумма ставок по одиночным: ${money(totalStake)}.`:''}</p>
  {health&&<div className="myHealth" aria-label="Состояние источников назначений">{health.sources?.filter((s:any,i:number,all:any[])=>all.findIndex(x=>x.authority===s.authority)===i).map((s:any)=><span key={s.league} title={s.error||''}><i className={s.status}/>{s.authority}: {({ok:'проверено',limited:'пауза по лимиту',degraded:'последняя проверка не удалась',manual:'ручная проверка',unknown:'нет данных'} as any)[s.status]}</span>)}<span><i className={health.fallback?.status==='limited'?'limited':'ok'}/>ESPN (резерв): {health.fallback?.status==='limited'?'пауза по лимиту':'ограничений нет'}</span></div>}
  {selected&&<dialog ref={dialog} className="refDialog todayDialog" aria-label="Подробный разбор матча" onCancel={()=>setSelected(null)} onClick={e=>{if(e.target===e.currentTarget)setSelected(null)}}><button className="heroClose" onClick={()=>setSelected(null)}>Закрыть ×</button><MatchReport key={selected.id} match={selected} data={data} profile={selected.referee?refereeProfile(selected.referee,selected.league,data):null}/></dialog>}
 </section>;
}

// Summary data is newer than the calendar only when it was fetched later.
function mergeDetail(event:any,detail:any){
 if(!detail||String(detail.id)!==String(event.id))return event;
 const fresh=Date.parse(detail.fetchedAt||detail.lastAttemptAt||'')>=(Date.parse(event.checkedAt||'')||0)&&!detail.stale;
 const base=withAppointment(event,detail);
 return fresh?{...base,...Object.fromEntries(['state','clock','statusName','statusDetail','homeScore','awayScore'].filter(k=>detail[k]!==undefined&&detail[k]!==null).map(k=>[k,detail[k]]))}:base;
}
