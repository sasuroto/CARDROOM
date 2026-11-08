/* eslint-disable @typescript-eslint/no-require-imports -- Offline CommonJS regression harness. */
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const React=require('react'),hooks={useState:React.useState,useRef:React.useRef,useEffect:React.useEffect};
const {installClock}=require('./helpers/test-clock.cjs'),clock=installClock(Date.parse('2026-11-08T12:00:00Z'));
const loader=require('../lib/draw-scenarios.ts'),realLoad=loader.loadDrawScenarios;
let pending=[],cells=[],cursor=0,queue=[],checks=0;
React.useState=initial=>{const i=cursor++;if(!cells[i])cells[i]={value:typeof initial==='function'?initial():initial};return [cells[i].value,v=>cells[i].value=typeof v==='function'?v(cells[i].value):v]};
React.useRef=initial=>{const i=cursor++;if(!cells[i])cells[i]={current:initial};return cells[i]};
React.useEffect=(fn,deps)=>{const i=cursor++,old=cells[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps?.[j]))){cells[i]={deps,cleanup:old?.cleanup};queue.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn()})}};
loader.loadDrawScenarios=options=>new Promise((resolve,reject)=>pending.push({options,resolve,reject}));
const Panel=require('../app/draw-watch.tsx').default;
const nodes=x=>x&&typeof x==='object'?[x,...React.Children.toArray(x.props?.children).flatMap(nodes)]:[];
const text=x=>typeof x==='string'||typeof x==='number'?String(x):x&&typeof x==='object'?React.Children.toArray(x.props?.children).map(text).join(' '):'';
const check=(ok,label)=>{assert.ok(ok,label);checks++};
const session=new Map();let props={initialLeague:'epl',locked:true,session};
function render(){cursor=0;const tree=Panel(props),effects=queue;queue=[];effects.forEach(fn=>fn());return tree}
function unmount(){cells.forEach(c=>c.cleanup?.());cells=[];queue=[]}
const refresh=tree=>nodes(tree).find(n=>n.type==='button'&&text(n).includes('подборку'));
function result(league='epl',extra={}){return {from:'2026-11-08',to:'2026-11-10',checkedAt:new Date().toISOString(),examined:1,issues:['Частичная история'],skipped:['Другая пара: недостаточно игр'],scenarios:[{match:{id:'123456',league,date:'2026-11-08T12:02:00Z',home:league+' Home',away:'Away',fixturesCheckedAt:new Date().toISOString()},leagueName:'League',season:'2026',checkedAt:new Date().toISOString(),fixturesCheckedAt:new Date().toISOString(),source:'https://www.espn.com/',partial:true,teams:[1,2].map(id=>({id:String(id),name:'Team'+id,n:3,goalsFor:3,goalsAgainst:3,oneOne:3,bothScored:3,events:[{id:'111111',date:'2026-11-01T00:00Z',goalsFor:1,goalsAgainst:1,opponent:'Other'}]}))}],...extra}}
(async()=>{try{
 let tree=render();check(pending.length===0&&text(tree).includes('Нажмите'),'initial state remains manual');
 const click=refresh(tree).props.onClick;const first=click();click();tree=render();check(pending.length===1&&nodes(tree).find(n=>n.type==='button').props.disabled,'double click starts exactly one request');
 const saved=result();pending[0].resolve(saved);await first;tree=render();check(text(tree).includes('epl Home'),'loaded scenario is rendered');
 unmount();tree=render();check(text(tree).includes('epl Home'),'Back/Forward remount retains completed per-league result');
 check(text(tree).includes('Частичная история')&&text(tree).includes('Другая пара'),'partial and skipped evidence survive restoration');
 check(pending.length===1,'restoration never starts automatic requests');
 check(session.get('epl').result.checkedAt===saved.checkedAt,'restoration never advances successful timestamp');
 unmount();props={...props,initialLeague:'ucl'};tree=render();check(!text(tree).includes('epl Home')&&text(tree).includes('Нажмите'),'new league never receives another league result');
 const other=refresh(tree).props.onClick();pending[1].resolve(result('ucl',{scenarios:[],issues:[],skipped:[]}));await other;unmount();tree=render();check(text(tree).includes('Подтверждённой подборки пока нет'),'confirmed empty result survives remount');
 unmount();props={...props,initialLeague:'epl'};tree=render();const retry=refresh(tree).props.onClick();tree=render();check(text(tree).includes('epl Home'),'refresh preserves the dated previous result while loading');
 pending[2].reject(Error('Ошибка сети'));await retry;tree=render();check(text(tree).includes('Ошибка сети')&&text(tree).includes('epl Home'),'failed retry preserves result with explicit failure');
 unmount();tree=render();check(text(tree).includes('Ошибка сети'),'last failure survives navigation');
 const interrupted=refresh(tree).props.onClick();const old=pending[3];unmount();check(old.options.signal.aborted,'leaving panel aborts in-flight work');tree=render();check(text(tree).includes('прервана')&&!nodes(tree).find(n=>n.type==='button').props.disabled,'return explains interrupted search and permits manual retry');
 const latest=refresh(tree).props.onClick();old.resolve(result('wrong'));await interrupted;tree=render();check(!text(tree).includes('wrong Home'),'late aborted completion cannot replace restored result');
 pending[4].resolve(result());await latest;tree=render();check(text(tree).includes('epl Home'),'manual retry after interrupted search succeeds');
 await clock.advance(120000);tree=render();check(!text(tree).includes('epl Home'),'started match is removed without making a new request');check(text(tree).includes('Обновите подборку'),'removed candidate has explicit refresh explanation');
 unmount();await clock.advance(180000);tree=render();check(!text(tree).includes('epl Home')&&text(tree).includes('устарела'),'expired restored result is not displayed as current candidates');
 check(pending.length===5,'expiry timers never fetch');
 unmount();props={...props,session:new Map()};tree=render();check(text(tree).includes('Нажмите'),'new page session does not inherit other session results');

 // Cached API source dates, not a renewed search timestamp, bound restored candidates.
 unmount();const cached=result();cached.scenarios[0].match.date=new Date(clock.now+3600000).toISOString();cached.scenarios[0].checkedAt=new Date(clock.now-300000).toISOString();
 session.set('epl',{result:cached,error:'',interrupted:false});props={...props,session};tree=render();check(!text(tree).includes('epl Home')&&text(tree).includes('устарели'),'new search timestamp does not revive expired cached analysis');
 unmount();cached.scenarios[0].checkedAt=new Date().toISOString();cached.scenarios[0].fixturesCheckedAt=new Date(clock.now-1800000).toISOString();tree=render();check(!text(tree).includes('epl Home'),'expired fixture evidence is hidden');
 unmount();cached.scenarios[0].fixturesCheckedAt=new Date().toISOString();tree=render();const incomplete=refresh(tree).props.onClick();pending.at(-1).resolve(result('epl',{scenarios:[],issues:['Источник недоступен']}));await incomplete;tree=render();check(text(tree).includes('epl Home')&&text(tree).includes('Новая проверка неполна'),'HTTP-200 failure result does not erase previous confirmed result');
 check(session.get('epl').result.checkedAt===cached.checkedAt,'failed check never advances last-good timestamp');
 unmount();props={...props,locked:false};tree=render();nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'ucl'}});tree=render();check(!text(tree).includes('epl Home')&&/отобрано:\s*0/.test(text(tree))&&text(tree).includes('устарела'),'unlocked league selector restores only its own snapshot');
 unmount();props={...props,initialLeague:'laliga'};tree=render();const failed=refresh(tree).props.onClick();pending.at(-1).reject(Error('network'));await failed;unmount();tree=render();check(text(tree).includes('network')&&!text(tree).includes('Нажмите'),'initial failed check restores error rather than initial prompt');
 unmount();
 // Actual bounded loader contract, all HTTP responses synthetic and no storage.
 const signal=new AbortController().signal,baseNow=clock.now,stamp=new Date().toISOString();
 let calls=[];let loaded=await realLoad({league:'epl',signal,fetcher:async url=>{calls.push(url);return Response.json({events:[],checkedAt:stamp})}});
 check(calls.length===3&&loaded.examined===0&&!loaded.issues.length,'genuine empty schedule completes exactly three manual dates');
 for(const status of [401,403,429,500]){calls=[];loaded=await realLoad({league:'epl',signal,fetcher:async url=>{calls.push(url);return new Response(null,{status})}});check(calls.length===1&&loaded.issues.some(x=>x.includes('HTTP '+status)),'HTTP '+status+' stops fixture requests without automatic retry')}
 calls=[];loaded=await realLoad({league:'epl',signal,fetcher:async url=>{calls.push(url);return new Response('not json')}});check(calls.length===1&&loaded.issues.length===1,'malformed response is an explicit limitation');
 const timed=realLoad({league:'epl',signal,fetcher:(_url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))});loaded=await clock.run(timed,60000);check(loaded.issues.some(x=>x.includes('60 секунд'))&&clock.now-baseNow===60000,'request timeout is bounded and visible');
 const abort=new AbortController();const cancelled=realLoad({league:'epl',signal:abort.signal,fetcher:(_url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))});abort.abort();await assert.rejects(cancelled,{name:'AbortError'});checks++;
 const fixture={id:'123456',league:'epl',date:new Date(clock.now+3600000).toISOString(),home:'Home',away:'Away',state:'pre'};
 const analysis={state:'pre',date:fixture.date,checkedAt:stamp,leagueName:'League',season:'2026',teams:[{id:'1',side:'home'},{id:'2',side:'away'}],history:['1','2'].map(id=>({id,events:[0,1,2].map(i=>({id:String(100000+i),date:new Date(clock.now-(i+1)*86400000).toISOString(),own:{goals:1},against:{goals:1}}))}))};
 calls=[];loaded=await realLoad({league:'epl',signal,fetcher:async url=>{calls.push(url);return Response.json(url.startsWith('/api/analysis')?analysis:{events:calls.length===1?[fixture]:[],checkedAt:stamp})}});
 check(loaded.scenarios.length===1&&loaded.scenarios[0].checkedAt===stamp&&loaded.scenarios[0].fixturesCheckedAt===stamp,'cached analysis and fixture dates survive actual loader unchanged');
 check(calls.every(url=>!url.includes('force'))&&calls.length===4,'loader retains manual three-day bound and no force query');
 for(const payload of [{...analysis,stale:true},{error:'Недоступен'}]){calls=[];loaded=await realLoad({league:'epl',signal,fetcher:async url=>{calls.push(url);return Response.json(url.startsWith('/api/analysis')?payload:{events:calls.length===1?[fixture]:[],checkedAt:stamp})}});check(!loaded.scenarios.length&&loaded.issues.length>0,'stale/error analysis is excluded with limitations')}
 console.log(`PASS ${checks} draw refresh lifecycle and loader assertions.`);

 }finally{unmount();loader.loadDrawScenarios=realLoad;Object.assign(React,hooks);clock.restore()}})().catch(e=>{console.error(e);process.exitCode=1});
