// Run: node tests/referee-journal.cjs. ESPN-shaped synthetic summaries and in-memory R2; no network.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),rq=Module.createRequire(root+'/package.json'),ts=rq('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const env={},load=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env}:load.call(this,id,...args)};
const J=rq(root+'/lib/referee-journal.ts'),R=rq(root+'/lib/referee-journal-refresh.ts'),Route=rq(root+'/app/api/referee-journal/route.ts'),ri=rq(root+'/lib/referee-intelligence.ts');
const React=rq('react'),render=rq('react-dom/server').renderToStaticMarkup,UI=rq(root+'/app/referee-intelligence.tsx');
const seed=rq(root+'/lib/seed.json');
let n=0;const check=(v,s)=>{assert.ok(v,s);n++};
const realNow=Date.now;let now=Date.parse('2026-10-17T12:00:00Z');Date.now=()=>now;
const values=new Map(),bucket={get:async k=>values.has(k)?{json:async()=>structuredClone(values.get(k))}:null,put:async(k,t)=>values.set(k,JSON.parse(t))};env.BUCKET=bucket;
const stats=(y,r,f)=>[{name:'yellowCards',displayValue:y===null?'':String(y)},{name:'redCards',displayValue:String(r)},{name:'foulsCommitted',displayValue:String(f)}];
function doc(id,date,{referee='Anthony Taylor',hy=2,ay=3,hr=0,ar=1,hf=10,af=12,state='post',slug='eng.1',officials}={}){
 return {header:{id:String(id),league:{slug},competitions:[{id:String(id),date,status:{type:{state}},competitors:[{homeAway:'home',score:'2',team:{id:'1',displayName:'Arsenal'}},{homeAway:'away',score:'1',team:{id:'2',displayName:'Chelsea'}}]}]},
  boxscore:{teams:[{team:{id:'1'},statistics:stats(hy,hr,hf)},{team:{id:'2'},statistics:stats(ay,ar,af)}]},
  gameInfo:{officials:officials??(referee?[{fullName:referee,position:{name:'Referee'}},{fullName:'Assistant One',position:{name:'Assistant Referee'}}]:[])}};
}
(async()=>{
 R.journalTiming.paceMs=0;
 // Record parsing.
 const r=J.journalRecord(doc(700000001,'2026-09-01T15:00Z'),'epl','2026-09-02T00:00Z');
 check(r&&r.referee==='Anthony Taylor'&&r.yellow.total===5&&r.red.total===1&&r.fouls.total===22&&r.score==='2 - 1','finished match parsed with both teams');
 check(J.journalRecord(doc(700000002,'2026-09-01T15:00Z',{state:'pre'}),'epl','x')===null,'unfinished match rejected');
 check(J.journalRecord(doc(700000003,'2026-09-01T15:00Z',{slug:'esp.1'}),'epl','x')===null,'other tournament rejected');
 check(J.journalRecord(doc(700000004,'2026-05-31T15:00Z'),'epl','x')===null,'before 1 June rejected');
 const noRef=J.journalRecord(doc(700000005,'2026-09-01T15:00Z',{referee:null}),'epl','x');check(noRef&&noRef.referee===null,'missing referee stays null');
 check(J.journalRecord(doc(700000006,'2026-09-01T15:00Z',{officials:[{fullName:'Only Assistant',position:{name:'Assistant Referee'}}]}),'epl','x').referee===null,'assistant never becomes referee');
 const blank=J.journalRecord(doc(700000007,'2026-09-01T15:00Z',{hy:null}),'epl','x');check(blank.yellow.total===null&&blank.yellow.away===3,'unknown team value makes total unknown, not zero');
 const zero=J.journalRecord(doc(700000008,'2026-09-01T15:00Z',{hy:0,ay:0,ar:0}),'epl','x');check(zero.yellow.total===0&&zero.red.total===0,'real zeros kept');
 // Merge and aggregation.
 const older={...r,checkedAt:'2026-09-01T18:00Z',yellow:{home:1,away:1,total:2}};
 const merged=J.mergeRecords([older],[r],[r]);check(merged.length===1&&merged[0].yellow.total===5,'duplicates removed; newer check wins');
 const recs=[r,{...r,id:'700000010',date:'2026-09-08T15:00Z',yellow:{home:1,away:1,total:2}},{...r,id:'700000011',referee:'Michael Oliver',yellow:{home:4,away:4,total:8}},noRef,blank];
 const lj=J.leagueJournal(recs,{finished:6,collected:5});
 check(!lj.complete&&lj.coverage.withoutReferee===1,'coverage incomplete and missing referee counted');
 check(lj.average.n===5&&lj.average.yellow.n===4&&lj.average.yellow.perMatch===(5+2+8+5)/4,'league average uses only matches with known totals');
 const taylor=lj.referees.find(x=>x.name==='Anthony Taylor');check(taylor.n===3&&taylor.yellow.n===2&&taylor.yellow.perMatch===3.5,'referee per-metric denominators');
 check(J.refereeSummary([{...r,date:'2026-09-01T15:00Z'},{...r,date:'2026-09-20T15:00Z'},{...r,date:'2026-09-05T15:00Z'}]).from==='2026-09-01'&&J.refereeSummary([{...r,date:'2026-09-01T15:00Z'},{...r,date:'2026-09-20T15:00Z'}]).to==='2026-09-20','date range independent of input order');
 check(J.refereeRecords(recs,'ANTHONY TAYLOR').length===3&&J.refereeRecords(recs,'Taylor').length===0&&J.refereeRecords(recs,'A. Taylor').length===0,'exact name only, no initials merge');
 check(J.leagueJournal(recs,{finished:5,collected:5}).complete,'complete only when all finished matches collected');
 check(R.journalMonths(new Date('2026-10-17T00:00Z')).join()==='202606,202607,202608,202609,202610','months since June');
 // Collection with mocked ESPN and R2.
 const events=Array.from({length:40},(_,i)=>({id:String(710000000+i),date:`2026-09-${String(1+i%28).padStart(2,'0')}T15:00Z`,status:{type:{state:'post'}}}));
 events.push({id:'719999999',date:'2026-10-25T15:00Z',status:{type:{state:'pre'}}});
 let calls=[];global.fetch=async url=>{url=String(url);calls.push(url);if(url.includes('scoreboard'))return Response.json({events:url.includes('202609')||url.includes('202610')?events.filter(e=>e.date.slice(0,7).replace('-','')===new URL(url).searchParams.get('dates')):[]});const id=new URL(url).searchParams.get('event');return Response.json(doc(id,events.find(e=>e.id===id).date,{referee:Number(id)%2?'Anthony Taylor':'Michael Oliver'}))};
 values.set('history/v1/epl/710000000.json',{data:doc(710000000,events[0].date),checkedAt:'2026-09-03T00:00Z'});
 let res=await R.refreshRefereeJournal('epl',bucket);
 const summaries=calls.filter(u=>u.includes('summary')).length;
 check(res.persisted&&summaries===R.MAX_SUMMARIES,'summaries per run are bounded');
 check(!calls.some(u=>u.includes('event=710000000')),'cached analysis summary reused, not fetched again');
 check(res.coverage.finished===40&&res.coverage.collected===31&&!res.complete,'coverage reports finished vs collected; future match excluded');
 check(calls.filter(u=>u.includes('scoreboard')).length===5&&5<=R.MAX_MONTHS,'every month since June scanned once in the first run');
 let read=await(await Route.GET(new Request('https://site/api/referee-journal?league=epl&read=1'))).json();
 check(read.runId===res.runId&&read.persisted&&!read.records,'readback confirms the run without raw records');
 check(read.integrity.records===read.integrity.uniqueIds&&read.integrity.records===31,'integrity counters exposed');
 const total=calls.length;res=await R.refreshRefereeJournal('epl',bucket);check(res.cached&&calls.length===total,'one-hour gate');
 now+=3600001;calls=[];res=await R.refreshRefereeJournal('epl',bucket);
 check(res.coverage.collected===40&&res.complete,'next run completes the remaining matches');
 check(calls.filter(u=>u.includes('scoreboard')).length===1&&calls.some(u=>u.includes('dates=202610&limit=500')),'only the open month is scanned again');
 const prof=await(await Route.GET(new Request('https://site/api/referee-journal?referee='+encodeURIComponent('Anthony Taylor')))).json();
 const epl=prof.leagues.find(l=>l.league==='epl');
 check(epl&&epl.records.length===21&&epl.records.every(x=>x.referee==='Anthony Taylor'),'referee endpoint returns only that referee');
 check(epl.average.n===19,'league comparison excludes the referee');
 // Field-wise merge: an empty later answer never erases confirmed values.
 const confirmed={...r,checkedAt:'2026-09-02T00:00Z'},emptyLater={...r,checkedAt:'2026-09-03T00:00Z',referee:null,yellow:{home:null,away:null,total:null},red:{home:0,away:2,total:2}};
 const kept=J.mergeRecords([confirmed],[emptyLater])[0];
 check(kept.referee==='Anthony Taylor'&&kept.yellow.total===5&&kept.red.total===2,'newer values win, empty fields keep confirmed data');
 // Shrinking calendar must not delete confirmed records; repeated runs create no duplicates.
 const before=(values.get('referee-journal/v1/epl.json')).records.length;
 const open=values.get('referee-journal/v1/epl.json');open.months['202609'].final=false;values.set('referee-journal/v1/epl.json',open);
 now+=3600001;const shrink=global.fetch;global.fetch=async url=>String(url).includes('scoreboard')?Response.json({events:[]}):shrink(url);
 res=await R.refreshRefereeJournal('epl',bucket);const stored=values.get('referee-journal/v1/epl.json');
 check(stored.records.length===before&&res.coverage.collected===40,'empty calendar answer keeps all 40 confirmed matches');
 check(stored.errors.some(e=>e.includes('нет 40 ранее найденных'))&&stored.months['202609'].ids.length===40&&!stored.months['202609'].final,'shrinking answer is reported; month list kept and stays open for recheck');
 global.fetch=shrink;for(let i=0;i<3;i++){now+=3600001;await R.refreshRefereeJournal('epl',bucket)}
 const ids=values.get('referee-journal/v1/epl.json').records.map(x=>x.id);check(ids.length===40&&new Set(ids).size===40,'three more cycles: no duplicates, nothing lost');
 // Rotation scheduler: one league per call, global gap, never-collected first, shared backoff.
 now+=3600001;values.delete('referee-journal/v1/_scheduler.json');calls=[];
 let step=await R.runScheduledJournal(bucket);check(step.status==='ran'&&step.league!=='epl','never-collected league runs before a collected one');
 const firstLeague=step.league;step=await R.runScheduledJournal(bucket);check(step.status==='spacing'&&Date.parse(step.nextAt)-now===R.MIN_GAP_MS,'second call within the gap is refused');
 const seen=new Set([firstLeague]);for(let i=0;i<9;i++){now+=R.MIN_GAP_MS;const x=await R.runScheduledJournal(bucket);if(x.status==='ran')seen.add(x.league)}
 check(seen.size===9,'all 9 leagues covered by rotation');
 now+=R.MIN_GAP_MS;step=await R.runScheduledJournal(bucket);check(step.status==='idle'||step.status==='ran','after a full sweep the scheduler idles until a league is due');
 check(R.nextLeague({epl:'2026-10-17T10:00Z',ucl:null},Date.parse('2026-10-17T10:30Z'))==='ucl'&&R.nextLeague(Object.fromEntries(['epl','ucl','laliga','segunda','seriea','bundesliga','ligue1','superlig','primeira'].map(k=>[k,'2026-10-17T10:00Z'])),Date.parse('2026-10-17T10:30Z'))===null,'due-league selection');
 now+=R.MIN_GAP_MS+3600001;values.set('referee-updates/source-backoff/site.api.espn.com.json',{until:now+600000});
 step=await R.runScheduledJournal(bucket);check(step.status==='source-limited','scheduler honours the shared ESPN backoff');values.delete('referee-updates/source-backoff/site.api.espn.com.json');
 const viaRoute=await Route.GET(new Request('https://site/api/referee-journal?next=1'));check(viaRoute.status===200&&['ran','spacing','idle'].includes((await viaRoute.json()).status),'next=1 endpoint');
 check((await Route.GET(new Request('https://site/api/referee-journal?next=1&league=epl'))).status===400,'next=1 takes no other parameters');
 // Pacing between ESPN requests.
 R.journalTiming.paceMs=30;const stamps=[];const realFetch=global.fetch;global.fetch=async u=>{stamps.push(realNow());return realFetch(u)};values.delete('referee-journal/v1/ligue1.json');
 await R.refreshRefereeJournal('ligue1',bucket);global.fetch=realFetch;R.journalTiming.paceMs=0;
 check(stamps.length>1&&stamps.slice(1).every((t,i)=>t-stamps[i]>=25),'requests are spaced by the pace interval');
 // 429 handling.
 now+=3600001;values.delete('referee-journal/v1/laliga.json');let hits=0;global.fetch=async()=>{hits++;return new Response('',{status:429,headers:{'Retry-After':'7200'}})};
 res=await R.refreshRefereeJournal('laliga',bucket);check(hits===1&&res.errors.some(e=>e.includes('429'))&&res.coverage.collected===0,'429 stops the run after one request');
 check(values.get('referee-updates/source-backoff/site.api.espn.com.json').until===now+7200000,'shared ESPN backoff stored');
 // Validation and storage failures.
 for(const q of ['league=bad','league=epl&read=2','referee=ab','referee=<script>','league=epl&referee=Anthony%20Taylor','league=epl&url=https://x'])check((await Route.GET(new Request('https://site/api/referee-journal?'+q))).status===400,'invalid query rejected: '+q);
 values.delete('referee-journal/v1/seriea.json');
 const all=await(await Route.GET(new Request('https://site/api/referee-journal'))).json();check(all.leagues.length===9&&all.leagues.find(l=>l.league==='seriea').status==='not-collected','status of all 9 leagues; missing ones explicit');
 env.BUCKET={get:async()=>null,put:async()=>{throw Error('down')}};
 const failed=await Route.GET(new Request('https://site/api/referee-journal?league=seriea'));check(failed.status===503&&!(await failed.json()).persisted,'unconfirmed storage is not reported as success');
 env.BUCKET=undefined;check((await Route.GET(new Request('https://site/api/referee-journal?league=seriea'))).status===503,'no storage → 503');
 // Profile with ESPN journal: no double counting, ESPN basis only when coverage is complete.
 const data={...seed},complete={source:'https://www.espn.com/soccer/',leagues:[{league:'epl',completedAt:'2026-10-17T12:00Z',coverage:{finished:40,collected:40},average:epl.average,records:epl.records}]};
 const p=ri.refereeIntelligence({name:'Anthony Taylor',league:'epl',data,espn:complete,journal:{matches:[{date:'2026-09-01',competition:'Premier League',home:'Arsenal',away:'Chelsea',yellow:9,red:0,source:'s'}]}});
 check(p.journal.kind==='espn'&&p.journal.n===21,'ESPN journal replaces the research journal, never summed');
 check(p.comparisonBasis.kind==='espn'&&p.scenarios.basis.includes('ESPN')&&p.scenarios.n===21,'complete ESPN tournament journal drives comparison and model');
 check(p.comparison.find(c=>c.key==='penalties').referee===null,'ESPN penalties stay unknown');
 const partial={...complete,leagues:[{...complete.leagues[0],coverage:{finished:40,collected:31}}]};
 const q=ri.refereeIntelligence({name:'Anthony Taylor',league:'epl',data,espn:partial});
 check(q.comparisonBasis?.kind!=='espn'&&q.espnCoverage.complete===false,'incomplete ESPN coverage is not used as league statistics');
 const html=render(React.createElement(UI.default,{name:'Anthony Taylor',league:'epl',data,espn:partial}));
 check(html.includes('собран не полностью')&&html.includes('31 из 40'),'incomplete coverage disclosed');
 const full=render(React.createElement(UI.default,{name:'Anthony Taylor',league:'epl',data,espn:complete}));
 check(full.includes('Факты источника')&&full.includes('Статистическая оценка')&&full.includes('Модель вероятности')&&!/NaN|Infinity|undefined/.test(full),'facts, estimates and model are labelled; valid output');
 // League cards.
 const cards=render(React.createElement(UI.RefereeLeagueCards,{league:'epl',leagueName:'Premier League',summary:{...read,...J.leagueJournal(epl.records.concat(epl.records.map(x=>({...x,id:x.id+'1',referee:'Michael Oliver'}))),{finished:40,collected:40}),persisted:true}}));
 check(cards.includes('Anthony Taylor')&&cards.includes('Michael Oliver')&&cards.includes('Собраны все 40')&&!/NaN|Infinity/.test(cards),'league cards render with coverage');
 check(render(React.createElement(UI.RefereeLeagueCards,{league:'seriea',leagueName:'Serie A',summary:{league:'seriea',status:'not-collected',persisted:false}})).includes('Нет данных'),'uncollected league shows Нет данных');
 check(render(React.createElement(UI.RefereeLeagueCards,{league:'seriea',leagueName:'Serie A',summary:null})).includes('недоступен'),'failed read shows an error state');
 Date.now=realNow;console.log(`PASS ${n} referee journal assertions: ESPN record parsing, nulls vs zeros, dedupe, coverage, bounded resumable collection, cache reuse, 429 backoff, API validation, storage failures, no double counting and UI labels.`);
})().catch(e=>{Date.now=realNow;console.error(e);process.exitCode=1});
