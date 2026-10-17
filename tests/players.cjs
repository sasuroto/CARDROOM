// Run: node tests/players.cjs. Synthetic match summaries, no network.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),rq=Module.createRequire(root+'/package.json'),ts=rq('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {playerCandidates}=rq(root+'/lib/match-analysis.ts');
let checks=0;function check(value,message){assert.ok(value,message);checks++}
const team=id=>({id,displayName:id==='A'?'Alpha':'Beta'});
const player=(id,values={},extra={})=>({athlete:{id,displayName:'Player '+id},position:{abbreviation:'M'},stats:Object.entries(values).map(([name,value])=>({name,value})),...extra});
function summary(id,date,rosters=[],overrides={}){return {header:{id,league:{id:'1',name:'Test League'},season:{year:2026,name:'2026/27 Test League'},competitions:[{id,date,status:{type:{state:'post'}},competitors:[{team:team('A')},{team:team('B')}]}]},rosters,...overrides}}
const roster=(id,players)=>({team:team(id),roster:players});
const current=summary('current','2026-10-16T18:00:00Z');
const prior=summary('one','2026-10-01T18:00:00Z',[roster('A',[
 player('1',{appearances:1,minutesPlayed:90,totalGoals:0}),player('2',{appearances:1,totalGoals:1}),player('3',{minutesPlayed:30}),
 player('4',{appearances:0,totalGoals:0}),player('5',{totalGoals:2}),player('6',{appearances:12,minutesPlayed:700,totalGoals:5}),
 player('1',{appearances:1,minutesPlayed:90,totalGoals:0})
]),roster('B',[player('B1',{appearances:1,minutesPlayed:80,totalGoals:0})])]);
const later=summary('two','2026-10-08T18:00:00Z',[roster('A',[player('1',{appearances:1}),player('2',{appearances:1,totalGoals:0})])]);
const wrongLeague=structuredClone(prior);wrongLeague.header.id='wrong';wrongLeague.header.competitions[0].id='wrong';wrongLeague.header.league={id:'2',name:'Other'};
const wrongSeason=structuredClone(prior);wrongSeason.header.season.year=2025;
const wrongTeam=structuredClone(prior);wrongTeam.header.competitions[0].id='unrelated';wrongTeam.header.competitions[0].competitors=[{team:{id:'Z'}}];
const future=summary('future','2026-10-17T18:00:00Z',prior.rosters);
const unfinished=summary('live','2026-10-10T18:00:00Z',prior.rosters);unfinished.header.competitions[0].status.type.state='in';
const rows=playerCandidates(current,{prior,later,duplicate:prior,wrongLeague,wrongSeason,wrongTeam,future,unfinished});
check(rows.length===4,'Only participants with match-level evidence are selected');
check(rows.filter(p=>p.teamId==='A').length===3&&rows.filter(p=>p.teamId==='B').length===1,'At most three per team, fewer when coverage is incomplete');
const first=rows.find(p=>p.id==='1'),second=rows.find(p=>p.id==='2'),third=rows.find(p=>p.id==='3');
check(first.n===2&&first.appearances===2&&first.historyN===2,'Deduplicate matches and player rows; filter tournament, season, team, dates and status');
check(first.minutes===90&&first.minutesN===1,'A missing minutes field does not add zero or invent 90 minutes');
check(first.goals===0&&first.goalsN===1,'An explicit zero remains distinct from missing goal data');
check(second.minutes===null&&second.minutesN===0&&second.goals===1&&second.goalsN===2,'Each metric keeps its own sample size');
check(third.appearances===1&&third.goals===null,'Positive recorded minutes prove participation without inventing goals');
check(rows.every(p=>p.starter===null&&p.lineupStatus==='unknown'&&!('modelShare' in p)),'Missing lineup does not prevent history selection or invent a forecast');
check(first.matches.map(m=>m.id).join(',')==='two,one'&&first.matches.every(m=>m.source.endsWith('/'+m.id)),'Evidence links and dates identify each contributing match');
check(first.period.from==='2026-10-01T18:00:00Z'&&first.period.to==='2026-10-08T18:00:00Z','Actual observed date range is retained');
const known=structuredClone(current);known.rosters=[roster('A',[player('1',{}, {starter:true}),player('2',{}, {starter:false})])];
const knownRows=playerCandidates(known,{prior,later});
check(knownRows.find(p=>p.id==='1').starter===true&&knownRows.find(p=>p.id==='2').lineupStatus==='bench','Confirmed start and bench are separate from historical statistics');
check(!knownRows.some(p=>p.id==='3'),'Published squad excludes historical players absent from it');
check(playerCandidates(current,{}).length===0,'No source history yields an empty, honest fallback');
const blank=summary('blank','2026-10-10T18:00:00Z',[roster('A',[player('7',{appearances:1,minutesPlayed:' ',totalGoals:''})])]);
const blankRow=playerCandidates(current,{blank})[0];check(blankRow.minutes===null&&blankRow.goals===null,'Blank source cells are not zeros');
const many=Object.fromEntries(Array.from({length:7},(_,i)=>['m'+i,summary('m'+i,`2026-10-${String(i+1).padStart(2,'0')}T18:00:00Z`,[roster('A',[player('1',{appearances:1,minutesPlayed:10})])])]));
check(playerCandidates(current,many)[0].appearances===7,'All available current-season team matches are retained beyond five');
const transferred=summary('transfer','2026-10-12T18:00:00Z',[roster('B',[player('1',{appearances:1,minutesPlayed:90})])]);
const transferredRows=playerCandidates(current,{prior,transferred});
check(transferredRows.filter(p=>p.id==='1').length===1&&transferredRows.find(p=>p.id==='1').teamId==='B','The same athlete is never selected for both teams; latest observed team wins');
const React=rq('react'),render=rq('react-dom/server').renderToStaticMarkup,ui=rq(root+'/app/player-intelligence.tsx'),research=rq(root+'/lib/player-intelligence.json');
const base=research.matches[0].players[0];
const archived=ui.selectArchivedPlayers([{...base,name:'José',team:'A'},{...base,name:'Jose',team:'B'},...Array.from({length:5},(_,i)=>({...base,name:'A'+i,team:'A'})),...Array.from({length:5},(_,i)=>({...base,name:'B'+i,team:'B'})),{...base,name:'Extra',team:'C'}]);
check(archived.length===6&&new Set(archived.map(p=>p.name)).size===6,'Archive removes normalized name duplicates and caps the total at six');
check(archived.filter(p=>p.team==='A').length===3&&archived.filter(p=>p.team==='B').length===3,'Archive caps each of the two teams at three');
const html=render(React.createElement(ui.default,{matchId:research.matches[0].matchId}));
check(html.includes('Историческая подборка')&&html.includes('Факты и даты ниже не перепроверены заново')&&html.includes('Текущая травма'),'Archive cannot be mistaken for current injury or availability verification');
check(html.includes('2026')&&html.includes('UTC+4')&&!html.includes('Все 5 игроков'),'Archive uses original timestamp with year/time zone and dynamic counts');
console.log(`PASS ${checks} player-selection assertions: evidence, scope, missing data, quotas, lineup separation and archive labels.`);
