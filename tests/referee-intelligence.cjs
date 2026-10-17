// Run: node tests/referee-intelligence.cjs. Saved verified data and synthetic edge cases; no network.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),rq=Module.createRequire(root+'/package.json'),ts=rq('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const ri=rq(root+'/lib/referee-intelligence.ts'),seed=rq(root+'/lib/seed.json'),refs=rq(root+'/lib/referees.json'),research=rq(root+'/lib/appointed-referees.json');
const React=rq('react'),render=rq('react-dom/server').renderToStaticMarkup,RefereeIntelligence=rq(root+'/app/referee-intelligence.tsx').default,{RefereeAppointmentBadge}=rq(root+'/app/referee-intelligence.tsx');
const data={...seed,refereesByLeague:{...refs,...seed.refereesByLeague}};
let n=0;const check=(v,s)=>{assert.ok(v,s);n++};const close=(a,b,e=1e-9)=>Math.abs(a-b)<e;

// Appointment status: never present unverified names as official.
const st=m=>ri.appointmentStatus(m).status;
check(st({})==='missing'&&st({referee:null})==='missing','no name is reported as missing, not as absent appointment');
check(st({referee:'A B',appointmentType:'RFEF · официальное назначение',currentVerified:true})==='official','verified federation publication is official');
check(st({referee:'A B',appointmentType:'UEFA · проверенное назначение'})==='official','UEFA verified appointment is official');
check(st({referee:'A B',appointmentType:'ESPN · данные матча',currentVerified:true})==='reported','ESPN feed is not presented as official');
check(st({referee:'A B',appointmentType:'RFEF · официальное назначение',currentVerified:false})==='unconfirmed','official notice that failed recheck is unconfirmed');
check(st({referee:'A B',appointmentType:'Premier League · официальное назначение',appointmentStale:true,currentVerified:true})==='unconfirmed','stale appointment flag wins over type');
check(st({referee:'A B',appointmentType:'Сохранённое назначение',stale:true})==='unconfirmed','saved appointment is unconfirmed');
check(st({referee:'A B',appointmentType:'DFB · официальное назначение · проверено вручную',stale:true,currentVerified:true})==='official','saved calendar record with a verified official notice stays official');
check(st({referee:'A B',appointmentSource:'https://www.uefa.com/x',currentVerified:true})==='official','official host is recognised');
check(st({referee:'A B',appointmentSource:'https://uefa.com.evil.example/x',currentVerified:true})==='reported','look-alike host is not official');
const snapshot=rq(root+'/lib/fixture-snapshot.json').events.filter(e=>e.referee);
check(snapshot.filter(e=>e.appointmentType==='Сохранённое назначение').every(e=>st(e)==='unconfirmed'),'all saved snapshot appointments are unconfirmed');

// Season metrics: missing values stay null.
const epl=refs.epl.rows[0],m=ri.rowMetrics(epl);
check(m.yellow.total===epl.yellowTotal&&close(m.yellow.perMatch,epl.yellowTotal/epl.yellowN),'Soccerbase yellow total is used exactly');
check(m.fouls.perMatch===null&&m.penalties.perMatch===null,'Soccerbase does not supply fouls or penalties → null');
const pt=ri.rowMetrics(refs.primeira.rows[0]);check(pt.red.perMatch===null&&pt.yellow.perMatch===refs.primeira.rows[0].yellow,'Footiqo red cards stay unknown');
const bl=ri.rowMetrics(refs.bundesliga.rows.find(r=>r.penalties>0));check(bl.penalties.total===1&&bl.penalties.n===2,'Balonario penalties are a sample total');
check(ri.rowMetrics({name:'X',n:3,yellow:0,yellowN:3}).yellow.perMatch===0,'a real zero is kept');
check(ri.rowMetrics({name:'X',n:0,yellow:4,yellowN:0}).yellow.perMatch===null,'empty sample produces no average');

// Tournament average: same table, weighted by matches, excluding the referee.
const rows=[{name:'A',n:2,yellow:6,yellowN:2},{name:'B',n:4,yellow:3,yellowN:4},{name:'C',n:1,yellow:null,yellowN:null}];
const avg=ri.tournamentAverage(rows,'yellow','A');check(avg.perMatch===3&&avg.n===4&&avg.referees===1,'average excludes the referee and missing rows');
check(close(ri.tournamentAverage(rows,'yellow').perMatch,(12+12)/6),'weighted by matches');
check(ri.tournamentAverage([],'fouls').perMatch===null,'no rows → no average');

// Scenario model.
const pmf=ri.negBinPmf(30,10,40);check(close(pmf.reduce((s,p)=>s+p,0),1,1e-6),'negative binomial pmf sums to 1');
check(close(pmf.reduce((s,p,x)=>s+p*x,0),3,1e-4),'negative binomial mean equals α/β');
check(close(ri.poissonOver(2,1.5),1-Math.exp(-2)*3),'Poisson tail is exact');
const sc=ri.cardScenarios({refereeTotal:25,refereeN:4,tournamentMean:4});
check(close(sc.mean,(40+25)/14),'posterior mean shrinks toward tournament');
check(sc.interval.low<sc.mean&&sc.mean<sc.interval.high,'80% interval surrounds the estimate');
check(sc.over.every((o,i,a)=>o.probability>=0&&o.probability<=1&&(!i||o.probability<=a[i-1].probability)),'over-probabilities bounded and decreasing in the line');
check(sc.over.every(o=>o.low<=o.probability&&o.probability<=o.high),'uncertainty range ordered and contains the estimate');
check(ri.rowMetrics({name:'X',n:3,yellow:4.33,yellowN:3}).yellow.estimated===true&&m.yellow.estimated===false,'totals from rounded averages are flagged as estimated');
check(sc.reliability==='Низкая'&&ri.reliability(10)==='Ограниченная'&&ri.reliability(30)==='Умеренная','reliability never claims high confidence');
const wide=ri.cardScenarios({refereeTotal:5,refereeN:1,tournamentMean:4}),narrow=ri.cardScenarios({refereeTotal:200,refereeN:40,tournamentMean:4});
check(wide.interval.high-wide.interval.low>narrow.interval.high-narrow.interval.low,'small sample yields wider uncertainty');
check(narrow.weight>wide.weight,'larger sample gets more weight');
for(const bad of [{refereeTotal:null,refereeN:4,tournamentMean:4},{refereeTotal:4,refereeN:0,tournamentMean:4},{refereeTotal:4,refereeN:2,tournamentMean:null},{refereeTotal:-1,refereeN:2,tournamentMean:4},{refereeTotal:NaN,refereeN:2,tournamentMean:4}])check(ri.cardScenarios(bad)===null,'invalid inputs produce no scenario');
check(ri.cardScenarios({refereeTotal:8,refereeN:2,tournamentMean:4}).red===null,'no red data → no red scenario');

// Journal since 1 June 2026.
const games=[{date:'2026-05-30',competition:'X',home:'A',away:'B',yellow:9,red:1,source:'s'},...Array.from({length:12},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,competition:i%2?'Cup':'League',home:i<3?'Alpha FC':'Gamma',away:'Beta',yellow:i,red:i===4?null:0,source:'s'})),{date:'bad',home:'A',away:'B',yellow:1},{date:'2026-09-20',home:'A',away:'B',yellow:-1}];
const j=ri.journalSummary(games,{teams:['Alpha','Zeta']});
check(j.n===12&&j.from==='2026-09-01'&&j.to==='2026-09-12','pre-June and invalid rows excluded');
check(j.last10.length===10&&j.last10[0].date==='2026-09-12','last 10 newest first');
check(j.redN===11&&j.redTotal===0,'unknown red is excluded from red denominator, not counted as 0');
check(j.byCompetition.length===2&&j.byCompetition.reduce((s,c)=>s+c.n,0)===12,'competition split covers all games');
check(j.focus[0].n===3&&j.focus[1].n===0&&j.focus[1].yellow===null,'team focus matches names and keeps unmatched team empty');
check(ri.journalSummary(games,{until:'2026-09-05T18:00Z'}).to==='2026-09-04','finished match excludes itself and later games');

// Saved real data: profile from the match's tournament, journal for UEFA appointees.
const prof=ri.refereeIntelligence({name:'Stuart Attwell',league:'epl',data});
check(prof.season&&prof.season.n===epl.n&&prof.season.source===refs.epl.source,'EPL profile uses the saved Soccerbase row');
check(prof.comparison.find(c=>c.key==='fouls').referee===null,'missing fouls are compared as missing');
check(prof.scenarios&&prof.scenarios.n===epl.yellowN,'scenario uses the real sample size');
check(ri.refereeIntelligence({name:'Unknown Official',league:'epl',data}).season===null,'unknown referee gets no invented statistics');
check(ri.refereeIntelligence({name:'Unknown Official',league:'epl',data}).scenarios===null,'unknown referee gets no scenario');
check(ri.refereeIntelligence({name:refs.primeira.rows[0].name,league:'primeira',data}).scenarioBlocked.includes('Сезон'),'unconfirmed season blocks the scenario');
const letexier=research.profiles.find(p=>p.name==='François Letexier');
const lp=ri.refereeIntelligence({name:letexier.name,league:'ucl',data,journal:{...letexier,checkedAt:research.checkedAt},match:{...letexier.fixture,date:'2027-01-01T00:00Z'}});
check(lp.journal.n===letexier.matches.length&&lp.journal.last10.length===Math.min(10,letexier.matches.length),'journal uses only Soccerbase matches, supplemental kept apart');
check(lp.appointment.status==='official','UEFA archive appointment shown as official');

// Rendering: no invalid output, «Нет данных» where the source has no metric.
const html=render(React.createElement(RefereeIntelligence,{name:letexier.name,league:'ucl',data,match:letexier.fixture}));
check(!/NaN|Infinity|Invalid Date|undefined/.test(html),'profile renders valid values');
check(html.includes('Последние матчи с 1 июня 2026')&&html.includes('По командам')&&html.includes('По турнирам'),'journal sections rendered');
check(html.includes('Официальное назначение')&&html.includes('Метод расчёта'),'status and method rendered');
const none=render(React.createElement(RefereeIntelligence,{name:'Unknown Official',league:'epl',data}));
check(none.includes('Нет данных')&&none.includes('Расчёт не выполнен')&&!/NaN|Infinity/.test(none),'unknown referee renders explicit missing state');
check(render(React.createElement(RefereeIntelligence,{name:'',league:'epl',data})).includes('Нет данных'),'absent name renders missing state');
const warn=console.warn;console.warn=()=>{};const broken=render(React.createElement(RefereeIntelligence,{name:'Stuart Attwell',league:'epl',data:{get refereesByLeague(){throw Error('boom')}}}));
console.warn=warn;check(broken.includes('временно недоступен'),'model error is contained');
check(render(React.createElement(RefereeAppointmentBadge,{match:{referee:'A B',appointmentType:'Сохранённое назначение',stale:true}})).includes('Не подтверждено повторно'),'badge marks saved appointment');
check(render(React.createElement(RefereeAppointmentBadge,{match:{}}))==='','no badge without a referee');
console.log(`PASS ${n} referee intelligence assertions: appointment status, missing data, tournament averages, Gamma–Poisson scenarios, journal since June, real saved data and rendering.`);
