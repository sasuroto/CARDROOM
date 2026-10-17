// Run: node tests/sample-stats.cjs. Synthetic verified match histories; no network.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),rq=Module.createRequire(root+'/package.json'),ts=rq('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {SAMPLE_METRICS,selectSample,sampleMean,sampleFrequency,samplePeriod,sharedSampleMatches}=rq(root+'/lib/sample-stats.ts');
let checks=0;function check(value,message){assert.ok(value,message);checks++}
const scope={before:'2026-10-16T12:00:00Z',leagueName:'Test League',season:'2026/27'};
function event(id,day,extra={}){return{id,date:`2026-10-${String(day).padStart(2,'0')}T12:00:00Z`,leagueName:scope.leagueName,season:scope.season,homeAway:'home',opponent:'Opponent',source:'https://www.espn.com/soccer/match/_/gameId/'+id,own:{goals:2,corners:6,yellow:2,red:0,shots:12,target:5,fouls:8,offsides:2,saves:3,possession:60},against:{goals:1,corners:4,yellow:3,red:0,shots:9,target:4,fouls:9,offsides:1,saves:3,possession:40},...extra}}
const base=Array.from({length:12},(_,i)=>event(String(i+1),i+1,{homeAway:i%2?'away':'home'}));
const dirty=[...base.slice().reverse(),base[0],event('current',16),event('future',20),event('bad-date',1,{date:'bad'}),event('wrong-league',14,{leagueName:'Cup'}),event('old-season',14,{season:'2025/26'}),event('no-league',14,{leagueName:undefined})];
const selected=selectSample(dirty,5,'all',scope);
check(selected.map(e=>e.id).join(',')==='12,11,10,9,8','Last five are sorted by match time, excluding current/future/wrong league/season');
check(selectSample(dirty,'all','all',scope).length===12,'All means unique available verified records, not requested count');
check(selectSample(dirty,20,'all',scope).length===12,'Requesting20 preserves actual lower sample size');
check(selectSample(dirty,5,'home',scope).map(e=>e.id).join(',')==='11,9,7,5,3','Venue filters before recent-N cutoff');
check(selectSample(dirty,5,'away',scope).map(e=>e.id).join(',')==='12,10,8,6,4','Away filtering uses actual team-side metadata');
check(selectSample([event('unknown',15,{homeAway:null}),event('missing',14,{homeAway:undefined})],5,'home',scope).length===0,'Missing venue is excluded rather than guessed');
check(selectSample([event('unknown',15,{homeAway:null})],5,'all',scope).length===1,'Unknown venue remains available in All');
check(selectSample(dirty,5,'all',{...scope,before:'not a date'}).length===0,'Unknown cutoff cannot leak future observations');
check(dirty[0].id==='12'&&base[0].id==='1','Filtering does not mutate source arrays');
const partial=[event('one',1,{own:{goals:0,corners:0,yellow:2},against:{goals:0,corners:null,yellow:3}}),event('two',2,{own:{goals:2,corners:4,yellow:null},against:{goals:1,corners:6,yellow:0}}),event('three',3,{own:{goals:null,corners:NaN,yellow:0},against:{goals:3,corners:5,yellow:0}}),event('four',4,{own:{goals:-1,corners:Infinity,yellow:undefined},against:{goals:null,corners:undefined,yellow:2}})];
check(sampleMean(partial,'goals','own').value===1&&sampleMean(partial,'goals','own').n===2,'Own mean excludes missing/negative values and retains actual zero');
check(sampleMean(partial,'goals','against').value===4/3&&sampleMean(partial,'goals','against').n===3,'Opponent mean has its independent denominator');
check(sampleMean(partial,'corners','own').value===2&&sampleMean(partial,'corners','own').n===2,'NaN/Infinity are not numeric evidence');
check(sampleMean(partial,'shots','own').value===null&&sampleMean(partial,'shots','own').n===0,'No metric evidence stays null, not zero');
for(const [metric] of SAMPLE_METRICS){const result=sampleMean(base,metric,'own');check(result.n===12&&Number.isFinite(result.value),'All ten metrics are recalculated on the provided records: '+metric)}
const goals=sampleFrequency(partial,'goals25'),btts=sampleFrequency(partial,'btts'),corners=sampleFrequency(partial,'corners95'),yellow=sampleFrequency(partial,'yellow45');
check(goals.n===2&&goals.count===1&&goals.percent===50,'Goals frequency requires both goal values with eligible games only');
check(btts.n===2&&btts.count===1,'BTTS counts both positive, including a genuine no-event game in denominator');
check(corners.n===1&&corners.count===1&&corners.percent===100,'Corner totals require both sides; no null-as-zero');
check(yellow.n===2&&yellow.count===1&&yellow.percent===50,'Yellow frequency denominator differs correctly from corner denominator');
check(sampleFrequency([],'btts').percent===null&&sampleFrequency([],'btts').n===0,'Empty frequency is not0%');
const threshold=[event('low',1,{own:{goals:1,corners:4,yellow:2},against:{goals:1,corners:5,yellow:2}}),event('high',2,{own:{goals:2,corners:5,yellow:3},against:{goals:1,corners:5,yellow:2}})];
for(const kind of ['goals25','corners95','yellow45'])check(sampleFrequency(threshold,kind).count===1,'Half thresholds correctly separate whole counts: '+kind);
check(samplePeriod(selected).from===base[7].date&&samplePeriod(selected).to===base[11].date,'Date range covers the actual selected records');
check(samplePeriod([])===null,'Empty sample has no fabricated date range');
const h=event('mutual',5),a={...h,own:h.against,against:h.own,homeAway:'away'};
check(sharedSampleMatches('A','B',[h],[a]).length===1,'H2H requires shared provider ID and inverse scores in different team histories');
check(sharedSampleMatches('A','A',[h],[a]).length===0&&sharedSampleMatches(null,'B',[h],[a]).length===0,'Same/unknown team identities cannot establish H2H');
check(sharedSampleMatches('A','B',[h],[{...a,id:'different'}]).length===0,'Matching names or scores alone cannot establish H2H');
check(sharedSampleMatches('A','B',[h],[{...a,own:{goals:9}}]).length===0,'Conflicting results cannot be presented as confirmed H2H');
check(sharedSampleMatches('A','B',[h],[{...a,date:base[1].date}]).length===0,'Conflicting dates are excluded from H2H');
const {buildHistory}=rq(root+'/lib/match-analysis.ts');
const team=id=>({id,displayName:id});
const current={header:{league:{name:'Test League'},season:{year:2026},competitions:[{date:scope.before}]},lastFiveGames:[{team:team('A'),events:[{id:'prior',gameDate:base[0].date,leagueName:'Test League',competitionName:'2026-27 Test League',opponent:team('B')}]}]};
const doc={header:{id:'prior',league:{name:'Test League'},season:{year:2026,name:'2026/27'},competitions:[{id:'prior',status:{type:{state:'post'}},competitors:[{team:team('A'),homeAway:'away',score:'1'},{team:team('B'),homeAway:'home',score:'0'}]}]}};
check(buildHistory(current,{prior:doc})[0].events[0].homeAway==='away','History builder uses confirmed competition side');
delete doc.header.competitions[0].competitors[0].homeAway;
check(buildHistory(current,{prior:doc})[0].events[0].homeAway===null,'History builder does not infer venue from competitor ordering');
const React=rq('react'),render=rq('react-dom/server').renderToStaticMarkup,MatchSamples=rq(root+'/app/match-samples.tsx').default;
const props={match:{id:'current',date:scope.before,home:'Alpha',away:'Beta'},analysis:{leagueName:scope.leagueName,season:scope.season,teams:[{id:'A',side:'home'},{id:'B',side:'away'}],history:[{id:'A',events:base},{id:'B',events:partial}],checkedAt:scope.before,source:'https://www.espn.com/'},loading:false};
const original=React.useState;let state=[],index=0;
React.useState=initial=>{const i=index++;if(!(i in state))state[i]=initial;return[state[i],value=>state[i]=value]};
function draw(){index=0;return MatchSamples(props)}
function nodes(x){return !x||typeof x!=='object'?[]:[x,...React.Children.toArray(x.props?.children).flatMap(nodes)]}
let tree=draw(),markup=render(tree);
check(markup.includes('10 из 12 загруженных игр')&&markup.includes('N=10'),'Initial UI reports real selected and loaded sample sizes');
nodes(tree).find(x=>x.type==='button'&&x.props.children===5).props.onClick();tree=draw();markup=render(tree);
check(markup.includes('5 из 12 загруженных игр')&&markup.includes('N=5'),'Changing recent-N updates table and summary');
nodes(tree).find(x=>x.type==='select').props.onChange({target:{value:'away'}});tree=draw();markup=render(tree);
check(markup.includes('0 из 4 загруженных игр')&&markup.includes('N=0'),'Venue switch updates both sides and preserves honest empty cells');
check(markup.includes('Эти фильтры относятся только к сравнению выше')&&!/NaN|Infinity|Invalid Date/.test(markup),'Scope is explicit; no invalid values render');
React.useState=original;
console.log(`PASS ${checks} sample-comparison assertions: scope, date order, venue, nulls, per-metric N, actual frequencies, verified H2H and UI filter changes.`);
