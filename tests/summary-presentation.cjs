/* eslint-disable @typescript-eslint/no-require-imports -- Offline CommonJS component regression harness. */
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const {installClock}=require('./helpers/test-clock.cjs'),clock=installClock(Date.parse('2026-11-08T12:00:00Z'));
const {classifyDataBlock,dataHealth,SUMMARY_INTERVAL}=require('../lib/data-health.ts');
const {summaryBlockStatuses,refereeTableStatus}=require('../lib/summary-presentation.ts');
const Summary=require('../app/summary-freshness.tsx').default;
const {RefereeTableNotice:Notice,RefereeTableEmpty:Empty,RefereeTableFoot:Foot}=require('../app/referee-table-status.tsx');
let checks=0,fetches=0;const check=(ok,label)=>{assert.ok(ok,label);checks++};
const oldFetch=global.fetch;global.fetch=async()=>{fetches++;throw Error('Offline test must not fetch')};
const stamp=new Date().toISOString(),old='2026-10-16T09:00:00Z';
const league={id:'epl',season:'2026/27',overview:{goals:2.5,fouls:22,shots:25,btts:50,source:'https://example.test/overview',checkedAt:stamp},cards:{avg:4,n:80,source:'https://example.test/cards',checkedAt:old},yellowSummary:{avg:3,n:70,derived:true,source:'https://example.test/yellow',checkedAt:'2026-11-08T11:00:00Z'},teamSource:'https://example.test/yellow',teamCheckedAt:'2026-11-08T11:00:00Z',teams:[{}]};
const get=(l=league,d={})=>Object.fromEntries(summaryBlockStatuses(d,l).map(x=>[x.key,x]));
const text=x=>typeof x==='string'||typeof x==='number'?String(x):x&&typeof x==='object'?React.Children.toArray(x.props?.children).map(text).join(' '):'';
const nodes=x=>x&&typeof x==='object'?[x,...React.Children.toArray(x.props?.children).flatMap(nodes)]:[];
const hooks={useState:React.useState,useEffect:React.useEffect,useMemo:React.useMemo,useRef:React.useRef};
(async()=>{try{
 // Every combination keeps the exact pre-extraction data-health classifier behavior.
 for(const date of [null,undefined,'bad',0,old,stamp,new Date(clock.now-SUMMARY_INTERVAL).toISOString(),new Date(clock.now+60000).toISOString()])for(const manual of [false,true])for(const partial of [false,true])for(const error of [null,'error']){
  const at=typeof date==='string'?Date.parse(date):NaN;
  const expected=!Number.isFinite(at)?'missing':error?'unavailable':manual?'snapshot':clock.now-at>SUMMARY_INTERVAL?'stale':partial?'partial':'fresh';
  check(classifyDataBlock(date,manual,partial,error,clock.now)===expected,'classifier preserves exact precedence and boundary');
 }
 const before=JSON.stringify(league);let groups=get();
 check(groups.overview.state==='fresh'&&groups.cards.state==='stale'&&groups.yellow.state==='fresh','each group has independent freshness');
 check(groups.overview.checkedAt===stamp&&groups.cards.checkedAt===old&&groups.yellow.checkedAt===league.yellowSummary.checkedAt,'own dates are preserved');
 check(groups.overview.source===league.overview.source&&groups.cards.source===league.cards.source&&groups.yellow.source===league.yellowSummary.source,'own source links are preserved');
 check(groups.overview.sampleSize===null&&groups.cards.sampleSize===80&&groups.yellow.sampleSize===70,'sample sizes are never borrowed');
 groups=get({...league,yellowSummary:{...league.yellowSummary,checkedAt:old}},{health:{blocks:[{key:'yellow',state:'fresh'}]},lastAttempt:stamp});
 check(groups.yellow.state==='stale'&&groups.yellow.checkedAt===old,'fresh team/global attempt and server health never refresh yellowSummary');
 for(const key of ['overview','cards','yellow']){
  const failed=get(league,{refreshErrors:[`epl: ${key}: blocked`],lastAttempt:stamp});
  check(failed[key].state==='unavailable','each exact block error marks only its own block');
  check(failed[key].checkedAt===get()[key].checkedAt,'failure preserves original date');
 }
 check(get({...league,id:'segunda'},{refreshErrors:['segunda: yellow-summary: blocked']}).yellow.state==='unavailable','Segunda has its own yellow-summary error key');
 check(get(league,{refreshErrors:['ucl: cards: blocked']}).cards.state==='stale','other leagues cannot contaminate source status');
 check(get({...league,teamRefreshMode:'snapshot',partial:true}).yellow.state==='snapshot','manual snapshot precedes partial');
 check(get({...league,partial:true}).yellow.state==='partial','partial coverage remains explicit');
 const independent={...league,id:'segunda',partial:true,teamRefreshMode:'snapshot',yellowSummary:{...league.yellowSummary,derived:undefined}};
 const standalone=get(independent).yellow;
 check(standalone.state==='fresh'&&standalone.checkedAt===independent.yellowSummary.checkedAt&&standalone.sampleSize===70&&standalone.source===independent.yellowSummary.source,'standalone Segunda aggregate ignores team coverage/manual mode and preserves its own evidence');
 check(get(independent,{refreshErrors:['segunda: yellow: blocked']}).yellow.state==='fresh','team-only error cannot override standalone aggregate');
 check(get({...league,partial:true,teamCheckedAt:stamp}).yellow.state==='fresh','newer team snapshot does not lend its coverage to older derived aggregate');
 check(get({...league,partial:true,teamRefreshMode:'snapshot',teamSource:'https://example.test/unrelated'}).yellow.state==='fresh','unrelated team source cannot lend its coverage/manual mode');
 check(get({...league,teamRefreshMode:'snapshot'},{refreshErrors:['epl: yellow: blocked']}).yellow.state==='unavailable','error precedes manual snapshot');
 for(const bad of [null,'bad','2026-11-09T12:00:00Z']){
  const missing=get({...league,cards:{...league.cards,checkedAt:bad}}).cards;
  check(missing.state==='missing'&&missing.checkedAt===null&&missing.statusLabel==='Дата среза не подтверждена','invalid/missing/future dates cannot prove freshness');
 }
 const missing=get({...league,overview:{source:league.overview.source,checkedAt:null},cards:{avg:null,checkedAt:null},yellowSummary:undefined},{refreshErrors:['epl: overview: failed']});
 check(Object.values(missing).every(x=>x.state==='missing'&&x.sampleSize===null),'absent values and denominators never become zero');
 check(missing.overview.description.includes('недоступна')&&!missing.overview.description.includes('прежние'),'missing failed source is not saved data');
 check(get({...league,cards:{avg:0,n:0,checkedAt:stamp}}).cards.state==='fresh','explicit true zero is retained');
 check(get({...league,cards:{avg:NaN,n:Infinity,checkedAt:stamp}}).cards.state==='missing','nonfinite evidence is missing');
 check(JSON.stringify(league)===before,'presentation does not mutate input values/dates');
 const health=dataHealth({leagues:[{...league,cornerSource:'x',corners:[],teamCheckedAt:stamp}]},clock.now);
 check(health.blocks.find(x=>x.key==='cards').state==='stale','actual dataHealth still invokes unchanged classifier');

 const seed=require('../lib/seed.json'),refs=require('../lib/referees.json');
 for(const id of ['uel','uecl','bundesliga2']){
  const group=refs[id],state=refereeTableStatus(group,0),notice=render(React.createElement(Notice,{group,league:id}));
  check(state.total===0&&!state.filtered&&state.notice.includes('пока не получена'),'empty seed is missing source rows, not filtered matches');
  check(!/Частичная подборка|сохранённый срез|Автоматическое обновление.*не подключено/.test(notice),'empty notice does not promise rows or infer disconnected provider');
  const html=render(React.createElement(React.Fragment,null,React.createElement(Empty,{group,visibleRows:0}),React.createElement(Foot,{group})));
  check(html.includes('панели матча')&&html.includes('Дата успешного среза не подтверждена'),'empty season table remains separate from match appointments');
  check(!/0 записей|проверено —|не назначен|Invalid Date/.test(html),'empty metadata does not fabricate confirmation');
 }
 const rows={rows:[{name:'Saved Ref',n:12}],checkedAt:old,partial:true,source:'https://example.test/ref',refreshError:'blocked',dataNote:'Сезон подтверждён источником.'};
 const rowBefore=JSON.stringify(rows),filtered=refereeTableStatus(rows,0);
 check(filtered.filtered&&filtered.emptyTitle==='Нет судей с такими условиями','source has rows but filters can have zero matches');
 check(filtered.notice.includes('сохранённые строки')&&filtered.notice.includes('Частичная подборка'),'old existing rows retain failure and coverage caveats');
 check(filtered.checkedAt===old&&JSON.stringify(rows)===rowBefore,'source failure preserves rows and successful source date');
 const never=refereeTableStatus({rows:[],checkedAt:null,partial:true,refreshError:'blocked',dataNote:'Сохранённый срез'},0);
 check(never.error&&never.notice.includes('подтверждённых строк')&&!/Частичная|Сохранённый|сохранённые/.test(never.notice),'failed empty source never claims partial/saved rows');
 check(refereeTableStatus({rows:[],checkedAt:old},0).notice==='Подтверждённых строк сезонной таблицы пока нет.','dated empty response is not falsely called never received');
 for(const bad of [null,'bad','2026-11-09T00:00:00Z']){
  const html=render(React.createElement(Foot,{group:{...rows,checkedAt:bad}}));
  check(html.includes('Дата успешного среза не подтверждена')&&!html.includes('Invalid Date'),'bad referee date has explicit unknown label');
 }
 check(refereeTableStatus({...rows,refreshError:null},1,{startedAt:stamp,errors:['Статистика: blocked']}).error,'newer source report failure is visible');
 check(!refereeTableStatus({...rows,checkedAt:stamp,refreshError:null},1,{startedAt:old,errors:['Статистика: blocked']}).error,'older source report cannot override newer rows');
 check(!refereeTableStatus({...rows,refreshError:null},1,{startedAt:stamp,errors:['Назначения: blocked']}).error,'appointment errors do not imply statistics failure');
 check(!refereeTableStatus({...rows,refreshError:null},1,{startedAt:'2026-11-09T00:00:00Z',errors:['Статистика: blocked']}).error,'future report ignored');

 let html=render(React.createElement(Summary,{data:{lastAttempt:stamp},league}));
 check(html.includes('aria-label="Актуальность сводки турнира"')&&!html.includes('<details'),'summary status is directly visible, not disclosure-only');
 check(html.includes('Срез устарел')&&html.includes('N = 80 матчей')&&html.includes('N = 70 матчей')&&html.includes('Размер выборки не подтверждён'),'actual summary component renders per-block caveats and denominators');
 check(html.includes(`dateTime="${old}"`)&&html.includes('UTC+4')&&html.includes(league.cards.source),'actual component renders original timestamp, timezone and source');
 check(!html.includes('Invalid Date')&&!html.includes('NaN'),'no invalid markup values');

 // Actual Home route and filter handlers, with all effects suppressed except routing.
 let state=[],idx=0,effects=[],refCells=[],refIdx=0;
 React.useState=initial=>{const i=idx++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v]};
 React.useRef=initial=>{const i=refIdx++;return refCells[i]||(refCells[i]={current:initial})};React.useMemo=f=>f();React.useEffect=f=>effects.push(f);
 const Home=require('../app/page.tsx').default;
 const listeners={};global.window={location:{hash:'#league/uel/referees'},history:{pushState:(_,__,hash)=>window.location.hash=hash},addEventListener:(n,f)=>listeners[n]=f,removeEventListener:n=>delete listeners[n]};
 const draw=()=>{idx=0;refIdx=0;effects=[];return Home()};
 draw();const cleanup=effects[1]();let tree=draw();const content=()=>nodes(tree).find(x=>x.props?.id==='content');
 html=render(content());check(html.includes('Сезонная таблица арбитров пока не получена')&&!html.includes('Частичная подборка'),'actual UEL page uses missing notice');
 window.location.hash='#league/uecl/referees';listeners.popstate();tree=draw();html=render(content());check(html.includes('Сезонная таблица арбитров пока не получена'),'Back/Forward uses newly selected league data');
 window.location.hash='#league/epl/referees';listeners.popstate();tree=draw();
 const search=nodes(tree).find(x=>x.type==='input'&&x.props['aria-label']==='Поиск судьи');search.props.onChange({target:{value:'definitely not a name'}});tree=draw();html=render(content());
 check(html.includes('Нет судей с такими условиями')&&!html.includes('Сезонная таблица арбитров пока не получена'),'actual search-empty is not source-empty');
 search.props.onChange({target:{value:''}});tree=draw();html=render(content());check(html.includes('refProfile')&&!html.includes('Нет судей с такими условиями'),'clearing filter restores unchanged rows');
 const minimum=nodes(tree).find(x=>x.type==='select'&&x.props['aria-label']==='Минимальная выборка');minimum.props.onChange({target:{value:'10'}});tree=draw();html=render(content());
 check(html.includes('Нет судей с такими условиями')&&!html.includes('Подтверждённых строк нет'),'minimum-sample filter empty does not erase the source table');
 minimum.props.onChange({target:{value:'0'}});tree=draw();html=render(content());check(html.includes('refProfile'),'resetting sample filter restores rows');
 window.location.hash='#league/epl/overview';listeners.popstate();tree=draw();const summary=nodes(content()).find(x=>x.type===Summary);
 check(!!summary&&summary.props.league.id==='epl','Home mounts status for exact selected league');
 html=render(content());check(html.indexOf('summaryFreshness')<html.indexOf('class="comparison"'),'status is beside values and above comparison');
 for(const bad of ['bad','2026-11-09T12:00:00Z']){
  state[0]={...seed,leagues:seed.leagues.map(x=>x.id==='epl'?{...x,overview:{...x.overview,checkedAt:bad}}:x)};tree=draw();html=render(content());
  check(html.includes('Дата среза не подтверждена')&&!/Invalid Date|09\.11\.2026/.test(html),'actual Home never shows rejected invalid/future overview date in the table link');
 }state[0]=seed;
 for(const id of ['uel','uecl']){window.location.hash=`#league/${id}/overview`;listeners.popstate();tree=draw();html=render(content());check(html.includes('Данные не получены')&&!html.includes('N = 0'),'empty summary shows missing data without invented sample');}
 cleanup();delete global.window;Object.assign(React,hooks);

 // Actual status component timer ages evidence, never fetches or renews dates.
 let cells=[],cursor=0,queue=[];
 React.useState=initial=>{const i=cursor++;if(!(i in cells))cells[i]={value:typeof initial==='function'?initial():initial};return [cells[i].value,v=>cells[i].value=typeof v==='function'?v(cells[i].value):v]};
 React.useEffect=(fn,deps)=>{const i=cursor++;if(!cells[i]){cells[i]={deps};queue.push(()=>cells[i].cleanup=fn())}};
 let props={data:{},league:{...league,overview:{...league.overview,checkedAt:new Date(clock.now-SUMMARY_INTERVAL+30000).toISOString()}}};
 const drawSummary=()=>{cursor=0;const node=Summary(props);const work=queue;queue=[];work.forEach(fn=>fn());return node};
 let summaryTree=drawSummary();check(text(summaryTree).includes('Проверено за последние 6 часов'),'near-boundary source initially fresh');
 await clock.advance(60000);summaryTree=drawSummary();check(nodes(summaryTree).filter(x=>x.props?.['data-state']==='stale').length===2,'timer ages overview without API call');
 await clock.advance(10000);
 const freshAfterMount=new Date(clock.now).toISOString();props={...props,league:{...props.league,overview:{...props.league.overview,checkedAt:freshAfterMount}}};summaryTree=drawSummary();
 check(nodes(summaryTree).filter(x=>x.props?.['data-state']==='fresh').length===2,'newer source date received 10 seconds after tick is immediately accepted');
 props={...props,league:{...props.league,id:'ucl',season:'2026/27',cards:{...props.league.cards,checkedAt:freshAfterMount}}};summaryTree=drawSummary();
 check(nodes(summaryTree).filter(x=>x.props?.['data-state']==='fresh').length===3,'league navigation before next timer uses current clock and new league evidence');
 check(props.league.overview.checkedAt===freshAfterMount&&fetches===0,'timer and props never fetch or rewrite source dates');
 cells.forEach(c=>c.cleanup?.());const count=cells[0].value;await clock.advance(60000);check(cells[0].value===count,'unmount clears local expiry timer');
 check(seed.leagues.length===16,'all configured leagues retained');
 console.log(`PASS ${checks} summary/referee presentation, classifier parity and actual component/route lifecycle assertions.`);
 }finally{Object.assign(React,hooks);delete global.window;global.fetch=oldFetch;clock.restore()}})().catch(e=>{console.error(e);process.exitCode=1});
