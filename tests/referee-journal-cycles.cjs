// Run: node tests/referee-journal-cycles.cjs. Five collection cycles over all 9 leagues against a
// SYNTHETIC ESPN with known ground truth and injected faults. No network. Counts are not real data.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),rq=Module.createRequire(root+'/package.json'),ts=rq('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const env={},load=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env}:load.call(this,id,...args)};
const R=rq(root+'/lib/referee-journal-refresh.ts'),{LEAGUES}=rq(root+'/lib/fixtures.ts');
R.journalTiming.paceMs=0;
let n=0;const check=(v,s)=>{assert.ok(v,s);n++};
const realNow=Date.now;let now=Date.parse('2026-10-17T12:00:00Z');Date.now=()=>now;
const values=new Map(),bucket={get:async k=>values.has(k)?{json:async()=>structuredClone(values.get(k))}:null,put:async(k,t)=>values.set(k,JSON.parse(t))};env.BUCKET=bucket;
// Synthetic ground truth: match counts per league, dates June–October; every 37th match has no referee in the source.
const SIZE={epl:70,ucl:110,laliga:80,segunda:105,seriea:70,bundesliga:63,ligue1:63,superlig:72,primeira:72};
const slug=Object.fromEntries(Object.entries(LEAGUES).map(([k,v])=>[v,k]));
const truth={};let seq=0;
for(const [league,size] of Object.entries(SIZE))truth[league]=Array.from({length:size},(_,i)=>{const id=String(800000000+(seq++)),month=6+Math.floor(i*5/size),day=1+(i%27);return{id,date:`2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T18:00Z`,referee:i%37===5?null:`Referee ${league} ${i%12}`,yellow:[i%4,(i+1)%5],red:[i%9===0?1:0,0],fouls:[10+i%6,11+i%5]}});
const fault={cycle:0};
const stat=(y,r,f)=>[{name:'yellowCards',displayValue:String(y)},{name:'redCards',displayValue:String(r)},{name:'foulsCommitted',displayValue:String(f)}];
function summaryDoc(league,m,hideReferee){return{header:{id:m.id,league:{slug:LEAGUES[league]},competitions:[{id:m.id,date:m.date,status:{type:{state:'post'}},competitors:[{homeAway:'home',score:'1',team:{id:'1',displayName:'Home '+m.id}},{homeAway:'away',score:'0',team:{id:'2',displayName:'Away '+m.id}}]}]},
 boxscore:{teams:[{team:{id:'1'},statistics:stat(m.yellow[0],m.red[0],m.fouls[0])},{team:{id:'2'},statistics:stat(m.yellow[1],m.red[1],m.fouls[1])}]},gameInfo:{officials:m.referee&&!hideReferee?[{fullName:m.referee,position:{name:'Referee'}}]:[]}}}
let requests=0;
global.fetch=async url=>{
 requests++;const u=new URL(String(url)),league=slug[u.pathname.split('/')[6]];
 if(fault.cycle===2&&league==='laliga'&&requests%3===0)return new Response('',{status:429,headers:{'Retry-After':'60'}});
 if(u.pathname.endsWith('/scoreboard')){
  const month=u.searchParams.get('dates');let events=truth[league].filter(m=>m.date.slice(0,7).replace('-','')===month);
  if(fault.cycle===3&&league==='ucl')events=events.slice(0,Math.floor(events.length/2));
  return Response.json({events:events.map(m=>({id:m.id,date:m.date,status:{type:{state:'post'}}}))});
 }
 const id=u.searchParams.get('event'),m=truth[league].find(x=>x.id===id);
 // Late officials: in cycle 1 every 10th Bundesliga summary arrives without the referee; later answers have it.
 return Response.json(summaryDoc(league,m,fault.cycle===1&&league==='bundesliga'&&Number(id)%10===0));
};
const rows=[],ever=new Map();
(async()=>{
 for(let cycle=1;cycle<=5;cycle++){
  fault.cycle=cycle;
  // One hour between cycles; inside a cycle the rotation step is called every MIN_GAP until it idles.
  // Cycles 2–4 one hour apart; cycle 5 the next day (daily recheck of old matches with missing fields).
  if(cycle>1)now+=cycle===5?86400001:3600001;
  values.delete('referee-updates/source-backoff/site.api.espn.com.json');
  for(let step=0;step<12;step++){now+=R.MIN_GAP_MS;const r=await R.runScheduledJournal(bucket);if(r.status==='idle')break}
  for(const league of Object.keys(SIZE)){
   const s=values.get(`referee-journal/v1/${league}.json`)||{records:[],coverage:{finished:0,collected:0},errors:[]};
   const ids=s.records.map(r=>r.id),dup=ids.length-new Set(ids).size,set=new Set(ids);
   const lost=[...(ever.get(league)||[])].filter(id=>!set.has(id)).length;
   const refLost=s.records.filter(r=>!r.referee&&(ever.get(league+':ref')||new Set()).has(r.id)).length;
   ever.set(league,new Set([...(ever.get(league)||[]),...ids]));ever.set(league+':ref',new Set([...(ever.get(league+':ref')||[]),...s.records.filter(r=>r.referee).map(r=>r.id)]));
   const wrong=s.records.filter(r=>{const t=truth[league].find(m=>m.id===r.id);return !t||(r.referee&&r.referee!==t.referee)||r.yellow.total!==t.yellow[0]+t.yellow[1]||r.red.total!==t.red[0]+t.red[1]}).length;
   rows.push({cycle,league,actual:SIZE[league],finished:s.coverage.finished,collected:s.records.length,noRef:s.records.filter(r=>!r.referee).length,dup,lost,refLost,wrong,errors:s.errors.length});
   check(dup===0,`cycle ${cycle} ${league}: no duplicates`);check(lost===0,`cycle ${cycle} ${league}: no confirmed record deleted`);
   check(refLost===0,`cycle ${cycle} ${league}: no confirmed referee erased`);check(wrong===0,`cycle ${cycle} ${league}: values match ground truth`);
  }
 }
 const table=['| Цикл | Лига | Эталон | Найдено в календаре | Собрано | Без арбитра | Дубли | Потери | Ошибки значений | Ошибок цикла |','|---|---|---|---|---|---|---|---|---|---|',...rows.map(r=>`| ${r.cycle} | ${r.league} | ${r.actual} | ${r.finished} | ${r.collected} | ${r.noRef} | ${r.dup} | ${r.lost} | ${r.wrong} | ${r.errors} |`)].join('\n');
 if(process.env.CYCLES_REPORT)fs.writeFileSync(process.env.CYCLES_REPORT,table+'\n\nESPN-запросов всего: '+requests+'\n');
 const last=rows.filter(r=>r.cycle===5);
 for(const r of last){check(r.collected===r.actual&&r.finished===r.actual,`${r.league}: complete after 5 cycles`);check(r.noRef===truth[r.league].filter(m=>!m.referee).length,`${r.league}: only source-missing referees remain empty`)}
 Date.now=realNow;console.log(`PASS ${n} cycle assertions: 5 cycles × 9 leagues on synthetic ESPN with 429, truncated calendar and late officials — no duplicates, no lost records or referees, values match, complete by cycle 5 (${requests} requests).`);
})().catch(e=>{Date.now=realNow;console.error(e);process.exitCode=1});
