/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node regression harness uses CommonJS. */
// Deterministic selected-panel regressions. Fixtures, clock, fetch and storage are synthetic.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const {selectedMatchStatus,selectedMatchFreshness,mergeSelectedMatch}=require(path.join(root,'app/selected-matches.tsx'));
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++};
const initialNow=Date.parse('2026-11-07T19:59:30Z'),iso=t=>new Date(t).toISOString();
const base={id:'888900111',league:'epl',date:'2026-11-07T19:00:00Z',home:'Home',away:'Away',state:'in',statusName:'STATUS_SECOND_HALF',homeScore:'2',awayScore:'1',clock:'61′',statusCheckedAt:iso(initialNow-30000),statusLastAttemptAt:iso(initialNow-30000),fetchedAt:iso(initialNow-30000),statusStale:false,referee:'Saved Referee',appointmentCheckedAt:iso(initialNow-86400000)};
const staleCases=[{statusStale:true},{statusStale:undefined,stale:true},{statusStale:undefined,error:'offline'},{statusCheckedAt:iso(initialNow-120001)},{statusCheckedAt:'invalid'},{statusCheckedAt:''},{statusCheckedAt:undefined,fetchedAt:undefined},{statusCheckedAt:undefined,fetchedAt:undefined,checkedAt:iso(initialNow)},{statusCheckedAt:iso(initialNow+1)},{statusCheckedAt:iso(initialNow+30000)},{statusCheckedAt:iso(initialNow+60000)},{statusCheckedAt:iso(initialNow+3600000)}];
check(selectedMatchStatus(base,initialNow)==='LIVE · 61′'&&selectedMatchFreshness(base,initialNow).fresh,'fresh LIVE has the genuine provider minute');
check(selectedMatchStatus(base,initialNow,true)==='Статус уточняется'&&!selectedMatchFreshness(base,initialNow,true).fresh,'offline immediately removes genuine recent LIVE without mutating evidence');
check(selectedMatchFreshness({...base,statusCheckedAt:iso(initialNow-120000)},initialNow).fresh,'two-minute boundary remains fresh');
for(const patch of staleCases){
 const match={...base,...patch},freshness=selectedMatchFreshness(match,initialNow);
 check(!freshness.fresh&&!freshness.label.startsWith('Данные на'),'stale/missing/invalid/future evidence never claims fresh');
 check(selectedMatchStatus(match,initialNow)==='Статус уточняется','unconfirmed LIVE loses its label and frozen minute');
 check(selectedMatchStatus({...match,statusName:'STATUS_HALFTIME'},initialNow)==='Статус уточняется','unconfirmed halftime is not presented as current');
 check(freshness.label.includes('Последний известный счёт')&&match.homeScore==='2'&&match.awayScore==='1','known score survives independently from status label');
 check(selectedMatchStatus({...match,state:'post',statusName:'STATUS_FINAL'},initialNow)==='Завершён','saved confirmed FT remains finished');
}
const appointment={...base,appointmentStale:true,currentVerified:false,stale:true,error:'В свежем ответе нет имени арбитра.'};
check(selectedMatchStatus(appointment,initialNow)==='LIVE · 61′'&&selectedMatchFreshness(appointment,initialNow).fresh,'explicit fresh status is independent from a real appointment warning');
check(selectedMatchStatus({...base,statusName:'STATUS_HALFTIME'},initialNow)==='Перерыв','fresh halftime stays distinct');
check(selectedMatchStatus({...base,state:'post',statusName:'STATUS_FINAL_AET',statusStale:true},initialNow).includes('доп. время'),'old extra-time result remains explicit');
check(selectedMatchStatus({...base,state:'post',statusName:'STATUS_FINAL_PEN',statusStale:true},initialNow).includes('по пенальти'),'old penalty result remains explicit');
check(selectedMatchStatus({...base,state:'pre',statusName:'STATUS_SCHEDULED'},initialNow)==='Статус уточняется','elapsed scheduled kickoff cannot invent live or FT');
check(selectedMatchStatus({...base,state:'pre',statusName:'STATUS_SCHEDULED',date:iso(initialNow+1800000)},initialNow)==='00:29','future kickoff stays in Tbilisi time');
for(const statusName of ['STATUS_POSTPONED','STATUS_CANCELED','STATUS_SUSPENDED','STATUS_DELAYED'])check(selectedMatchStatus({...base,statusName,statusStale:true},initialNow)!=='Статус уточняется','stable non-live status meaning is unchanged');
check(selectedMatchFreshness({...base,statusCheckedAt:undefined},initialNow).fresh,'legacy fetchedAt remains valid score evidence');
check(selectedMatchFreshness({...base,statusCheckedAt:iso(initialNow-86400000),checkedAt:iso(initialNow),appointmentCheckedAt:iso(initialNow)},initialNow).label.includes('06.11.2026'),'old score shows its full confirmed date, never new appointment time');
check(selectedMatchFreshness({...base,statusCheckedAt:'invalid'},initialNow).label.includes('дата неизвестна'),'invalid date is explicit');
check(selectedMatchFreshness({...base,statusCheckedAt:iso(initialNow+1)},initialNow).label.includes('дата в будущем'),'future evidence is explicit');
for(const badTime of [undefined,'invalid',iso(initialNow+30000)]){
 const incoming={...base,homeScore:'9',statusCheckedAt:badTime,fetchedAt:badTime,lastAttemptAt:iso(initialNow)};
 const rejected=mergeSelectedMatch(base,incoming,initialNow);
 check(rejected.homeScore==='2'&&rejected.awayScore==='1'&&rejected.statusCheckedAt===base.statusCheckedAt&&rejected.statusStale,'unusable incoming evidence preserves confirmed score/date and marks status stale');
 const recovered=mergeSelectedMatch(rejected,{...base,homeScore:'3',statusCheckedAt:iso(initialNow),statusLastAttemptAt:iso(initialNow),fetchedAt:iso(initialNow)},initialNow);
 check(recovered.homeScore==='3'&&selectedMatchFreshness(recovered,initialNow).fresh,'valid observation recovers after unusable date');
}
const future=iso(initialNow+3600000),badPrior={...base,homeScore:'9',statusCheckedAt:future,statusLastAttemptAt:future,fetchedAt:future};
const recoveredPrior=mergeSelectedMatch(badPrior,{...base,statusCheckedAt:iso(initialNow),fetchedAt:iso(initialNow)},initialNow);
check(recoveredPrior.homeScore==='2'&&recoveredPrior.fetchedAt===iso(initialNow)&&selectedMatchFreshness(recoveredPrior,initialNow).fresh,'genuine current evidence recovers from previously stored future-first snapshot');
const coldFuture=mergeSelectedMatch({id:base.id,league:base.league},{...base,statusCheckedAt:future,fetchedAt:future},initialNow);
check(coldFuture.homeScore===undefined&&!selectedMatchFreshness(coldFuture,initialNow).fresh,'future-first response cannot invent a confirmed initial score');
check(selectedMatchStatus(coldFuture,initialNow)==='Нет данных','completed future-first failure is not stuck loading');
for(const badTime of [undefined,'invalid']){
 const coldInvalid=mergeSelectedMatch({id:base.id,league:base.league},{...base,statusCheckedAt:badTime,fetchedAt:badTime},initialNow);
 check(selectedMatchStatus(coldInvalid,initialNow)==='Нет данных'&&coldInvalid.homeScore===undefined,'completed invalid/undated first response is unavailable, not loading or scored');
 check(selectedMatchStatus(mergeSelectedMatch(coldInvalid,base,initialNow),initialNow)==='LIVE · 61′','genuine observation recovers cold invalid/undated first response');
}
check(selectedMatchStatus({id:base.id,league:base.league},initialNow)==='Загружаю…','initial unanswered request remains loading');
check(mergeSelectedMatch(coldFuture,base,initialNow).homeScore==='2','genuine observation recovers from rejected future-first response');
const appointmentMerge=mergeSelectedMatch(base,{...appointment,statusCheckedAt:iso(initialNow),fetchedAt:iso(initialNow)},initialNow);
check(appointmentMerge.appointmentStale&&appointmentMerge.error===appointment.error&&appointmentMerge.referee===base.referee&&selectedMatchFreshness(appointmentMerge,initialNow).fresh,'status merge preserves appointment warning and known referee');

// Run the actual component with deterministic hooks and a controllable transport.
const React=require('react'),favorites=require(path.join(root,'app/favorites.tsx'));
const hooks={useState:React.useState,useRef:React.useRef,useEffect:React.useEffect},originalFavorites=favorites.useFavorites,originalNow=Date.now;
const names=['window','document','navigator','localStorage','fetch','setTimeout','clearTimeout','setInterval','clearInterval'];
const descriptors=Object.fromEntries(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
const timeouts=new Map(),intervals=new Map(),stored={'cardroom:selected-panel:expanded':'false'},pending=[];let timerId=0,now=initialNow,opened=null,removed=null;
function target(extra={}){const listeners=new Map();return {...extra,listeners,addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),emit:(type,event={})=>{for(const fn of [...(listeners.get(type)||[])])fn(event)},count:()=>[...listeners.values()].reduce((n,s)=>n+s.size,0)}}
const windowMock=target(),documentMock=target({visibilityState:'visible'}),navigatorMock={onLine:true};
const set=(key,value)=>Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
set('window',windowMock);set('document',documentMock);set('navigator',navigatorMock);Date.now=()=>now;
set('localStorage',{getItem:k=>stored[k]??null,setItem:(k,v)=>stored[k]=String(v)});
set('setTimeout',(fn,ms)=>{const id=++timerId;timeouts.set(id,{fn,ms});return id});set('clearTimeout',id=>timeouts.delete(id));
set('setInterval',(fn,ms)=>{const id=++timerId;intervals.set(id,{fn,ms});return id});set('clearInterval',id=>intervals.delete(id));
set('fetch',(url,options)=>new Promise((resolve,reject)=>pending.push({url,options,resolve,reject})));
let chosen=[{kind:'match',id:'epl:'+base.id,league:'epl',label:'Home — Away'}];
favorites.useFavorites=()=>({items:chosen,ready:true,storageError:false,toggle:(...args)=>{removed=args;chosen=[]}});
let cells=[],cursor=0,queue=[];
React.useState=initial=>{const i=cursor++;if(!cells[i])cells[i]={value:typeof initial==='function'?initial():initial};return [cells[i].value,v=>cells[i].value=typeof v==='function'?v(cells[i].value):v]};
React.useRef=initial=>{const i=cursor++;if(!cells[i])cells[i]={current:initial};return cells[i]};
React.useEffect=(fn,deps)=>{const i=cursor++,old=cells[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps?.[j]))){cells[i]={deps,cleanup:old?.cleanup};queue.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn()})}};
const Panel=require(path.join(root,'app/selected-matches.tsx')).default;
const nodes=x=>x&&typeof x==='object'?[x,...React.Children.toArray(x.props?.children).flatMap(nodes)]:[];
const text=x=>typeof x==='string'||typeof x==='number'?String(x):x&&typeof x==='object'?React.Children.toArray(x.props?.children).map(text).join(' '):'';
const card=tree=>nodes(tree).find(x=>x.type==='article'),open=tree=>nodes(tree).find(x=>x.props?.className==='selectedMatchOpen');
const scores=tree=>nodes(tree).filter(x=>x.type==='strong').map(text).join(':');
function render(){cursor=0;const tree=Panel({data:{leagues:[]},onOpen:m=>opened=m});const effects=queue;queue=[];effects.forEach(fn=>fn());return tree}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
const cleanup=()=>{for(const cell of cells)cell?.cleanup?.();cells=[];queue=[]};
const resolve=async(index,payload)=>{pending[index].resolve({ok:true,json:async()=>payload});await flush()};
const tick=()=>{for(const timer of intervals.values())timer.fn()};
(async()=>{try{
 render();check(pending.length===1,'mount starts one selected-match request');
 windowMock.emit('focus');windowMock.emit('online');await flush();check(pending.length===1,'slow initial request cannot overlap on repeated focus/online events');
 // A real response can arrive between display-clock ticks. It is not future evidence.
 now+=10000;await resolve(0,{...base,statusCheckedAt:iso(now),statusLastAttemptAt:iso(now),fetchedAt:iso(now)});let tree=render();
 check(text(open(tree)).includes('LIVE · 61′')&&card(tree).props.className.includes('isLive'),'actual fresh card uses LIVE label and styling');
 check(text(open(tree)).includes('Данные на')&&!text(open(tree)).includes('дата в будущем'),'new response advances display clock immediately without waiting for interval');
 check(scores(tree)==='2:1'&&text(tree).includes('07.11.2026'),'actual card shows confirmed score and full observation date');
 check([...timeouts.values()][0].ms===30000,'genuine live status keeps 30-second polling');
 navigatorMock.onLine=false;windowMock.emit('offline');tree=render();
 check(!text(open(tree)).includes('LIVE')&&!card(tree).props.className.includes('isLive')&&scores(tree)==='2:1'&&text(tree).includes('Нет соединения'),'OS offline immediately removes still-fresh LIVE but preserves score');
 navigatorMock.onLine=true;windowMock.emit('online');await resolve(1,base);tree=render();
 check(card(tree).props.className.includes('isLive'),'successful immediate reconnection restores genuine live status');
 now+=180000;tick();tree=render();
 check(text(open(tree)).includes('Статус уточняется')&&!text(open(tree)).includes('LIVE')&&!card(tree).props.className.includes('isLive'),'display clock alone expires LIVE text, frozen minute and styling');
 check(scores(tree)==='2:1'&&text(tree).includes('Последний известный счёт'),'aging preserves score with stale provenance');
 check(open(tree).props['aria-label'].includes('Статус уточняется')&&!open(tree).props['aria-label'].includes('LIVE'),'accessible name also stops claiming live');
 open(tree).props.onClick();check(opened.id===base.id&&opened.homeScore==='2','stale card still opens exact saved match');
 navigatorMock.onLine=false;windowMock.emit('offline');tree=render();
 check(text(tree).includes('Нет соединения')&&scores(tree)==='2:1'&&!card(tree).props.className.includes('isLive'),'offline retains saved score without live emphasis');
 check(timeouts.size===0,'offline clears polling, not selected matches');
 navigatorMock.onLine=true;windowMock.emit('online');await flush();
 await resolve(2,{...appointment,homeScore:'3',statusCheckedAt:iso(now),statusLastAttemptAt:iso(now),fetchedAt:iso(now)});tree=render();
 check(card(tree).props.className.includes('isLive')&&text(open(tree)).includes('LIVE · 61′')&&scores(tree)==='3:1','reconnection restores genuine LIVE while appointment warning persists');
 open(tree).props.onClick();check(opened.appointmentStale&&opened.error===appointment.error&&opened.referee===base.referee,'navigation retains genuine appointment warning and confirmed referee');
 windowMock.emit('focus');pending[3].reject(Error('synthetic offline'));await flush();tree=render();
 check(!text(open(tree)).includes('LIVE')&&!card(tree).props.className.includes('isLive')&&scores(tree)==='3:1','transport failure removes current LIVE immediately and keeps score');
 windowMock.emit('focus');await resolve(4,{...base,state:'post',statusName:'STATUS_FINAL',homeScore:'3',statusCheckedAt:iso(now),statusLastAttemptAt:iso(now),fetchedAt:iso(now)});tree=render();
 check(text(open(tree)).includes('Завершён')&&scores(tree)==='3:1'&&!card(tree).props.className.includes('isLive'),'genuine FT remains finished without live styling');
 check([...timeouts.values()][0].ms===600000,'confirmed FT keeps idle polling cadence');
 now+=86400000;tick();tree=render();check(text(open(tree)).includes('Завершён')&&text(tree).includes('08.11.2026')&&scores(tree)==='3:1','old FT retains final result and dated provenance');
 const expand=()=>nodes(tree).find(x=>x.props?.['aria-controls']==='selected-matches-grid');expand().props.onClick();tree=render();
 check(tree.props.className.includes('isExpanded')&&stored['cardroom:selected-panel:expanded']==='true','expansion interaction and persistence remain intact');
 windowMock.emit('keydown',{key:'Escape'});tree=render();check(tree.props.className.includes('isCompact')&&stored['cardroom:selected-panel:expanded']==='false','Escape collapse and persistence remain intact');
 // A late response must not resurrect a removed selection or restart polling.
 windowMock.emit('focus');check(pending.length===6,'manual/focus recovery still starts one request');
 nodes(tree).find(x=>x.props?.className==='selectedMatchRemove').props.onClick();tree=render();
 check(removed[1]==='epl:'+base.id&&tree===null,'remove targets exact favorite and hides empty panel');
 await resolve(5,{...base,homeScore:'9',statusCheckedAt:iso(now),fetchedAt:iso(now)});tree=render();
 check(tree===null&&timeouts.size===0,'late removed-match response cannot restore card or schedule polling');
 cleanup();check(windowMock.count()===0&&documentMock.count()===0&&timeouts.size===0&&intervals.size===0,'unmount cleans every listener and timer');
 console.log(`PASS ${checks} selected-match freshness, provenance, recovery and interaction checks.`);
 }finally{cleanup();Object.assign(React,hooks);favorites.useFavorites=originalFavorites;Date.now=originalNow;for(const key of names){if(descriptors[key])Object.defineProperty(globalThis,key,descriptors[key]);else delete globalThis[key]}}})().catch(error=>{console.error(error);process.exitCode=1});
