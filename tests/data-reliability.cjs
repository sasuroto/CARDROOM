const fs=require('node:fs'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const originalLoad=Module._load,env={};Module._load=function(id,...args){return id==='cloudflare:workers'?{env}:originalLoad.call(this,id,...args)};
const {createSourceReader,SourceError}=require('../lib/source-fetch.ts'),{blockDue,runRefresh,mergeBlockStatus,BLOCK_INTERVAL}=require('../lib/data-refresh.ts');
const {writeVerified}=require('../lib/cache.ts'),{dataHealth}=require('../lib/data-health.ts');
let n=0;const check=(x,s)=>{assert.ok(x,s);n++};
const store=()=>{const values=new Map();return {values,get:async k=>values.has(k)?{json:async()=>JSON.parse(values.get(k))}:null,put:async(k,v)=>{values.set(k,v)}}};
const hang=(url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason)));
const task=(id,url,data)=>({id,url,checkedAt:null,apply:(html,now)=>{data[id]={html,now}}});
// AbortSignal.timeout timers are unref'd in Node; keep the loop alive while a fetch hangs.
const keep=setInterval(()=>{},1000);
(async()=>{
 const now=Date.now(),iso=t=>new Date(t).toISOString();
 check(!blockDue(undefined,iso(now-3600000),now)&&blockDue(undefined,iso(now-BLOCK_INTERVAL),now)&&blockDue(undefined,null,now),'without a schedule a block is due only when its data is 6 h old or missing');
 check(!blockDue({nextAt:iso(now+60000)},null,now)&&blockDue({nextAt:iso(now-1)},iso(now),now),'a stored schedule decides when the block is due');

 // A host that times out fails its own block; its queued blocks wait; other hosts finish.
 let bucket=store(),calls=[];global.fetch=async(url,init)=>{calls.push(url);return url.includes('slow.example')?hang(url,init):new Response('ok '+url)};
 let data={},source=createSourceReader(bucket,{deadline:now+5000,timeoutMs:50});
 let r=await runRefresh(data,[task('a:cards','https://slow.example/1',data),task('a:overview','https://slow.example/2',data),task('b:cards','https://fast.example/1',data),task('c:cards','https://other.example/1',data)],source,now);
 check(r.ok===2&&r.failed===1&&r.deferred===1,'timeout fails one block, defers the same host and lets the rest of the pass finish');
 check(calls.filter(u=>u.includes('slow.example')).length===1,'no second request to a host that just timed out');
 check(data.blockStatus['a:cards'].error==='Таймаут ответа источника'&&Date.parse(data.blockStatus['a:cards'].nextAt)>=now+15*60000,'timed-out block retries no sooner than 15 min');
 check(!data.blockStatus['a:overview']&&data['b:cards']&&data['c:cards'],'deferred block keeps its schedule; other blocks are applied');
 check(data.refreshErrors.length===1&&data.refreshErrors[0].startsWith('a: cards: '),'refresh errors list only failed blocks in health format');
 check(JSON.parse(bucket.values.get('referee-updates/source-backoff/slow.example.json')).until>=now+15*60000,'timeout backoff is shared with later passes');

 // Retry-After from 429 and 503 is honoured, with minimum back-off.
 for(const [status,retry,min] of [[429,'7200',7200000],[503,null,30*60000],[403,null,6*3600000]]){
  bucket=store();data={};global.fetch=async()=>new Response('',{status,headers:retry?{'Retry-After':retry}:{}});
  r=await runRefresh(data,[task('x:cards','https://limited.example/a',data),task('x:overview','https://limited.example/b',data)],createSourceReader(bucket,{deadline:now+5000}),now);
  check(r.failed===2&&Date.parse(data.blockStatus['x:cards'].nextAt)>=now+min-1000&&Date.parse(data.blockStatus['x:overview'].nextAt)>=now+min-1000,`HTTP ${status} schedules both blocks after the source back-off`);
 }
 // A host still in back-off is not requested again by a new pass.
 let requests=0;global.fetch=async()=>{requests++;return new Response('ok')};
 r=await runRefresh({},[task('x:cards','https://limited.example/a',{})],createSourceReader(bucket,{deadline:now+5000}),now);
 check(requests===0&&r.failed===1,'persisted back-off blocks the host across passes');

 // Per-origin cap and spacing.
 const times=[];global.fetch=async url=>{times.push(Date.now());return new Response('ok')};data={};
 r=await runRefresh(data,[1,2,3].map(i=>task('s:'+i,'https://spaced.example/'+i,data)),createSourceReader(store(),{deadline:now+10000,gapMs:120,maxPerOrigin:2}),now);
 check(r.ok===2&&r.deferred===1,'per-origin cap defers the rest of the queue');
 check(times[1]-times[0]>=110,'requests to one origin are spaced');
 // Budget: requests that would start after the deadline are deferred, not attempted.
 requests=0;global.fetch=async()=>{requests++;return new Response('ok')};
 r=await runRefresh({},[task('d:cards','https://late.example/a',{})],createSourceReader(store(),{deadline:Date.now()+500}),now);
 check(requests===0&&r.deferred===1,'no request starts without enough pass budget left');
 // Overlapping passes: the newer attempt of every block survives.
 const merged=mergeBlockStatus({a:{attemptedAt:iso(now)},b:{attemptedAt:iso(now-1000)}},{a:{attemptedAt:iso(now-5000)},b:{attemptedAt:iso(now)}});
 check(merged.a.attemptedAt===iso(now)&&merged.b.attemptedAt===iso(now),'block status merge keeps the newer attempt');

 // Coverage honesty: partial tables, missing fields, wrong season and source errors never become full or zero data.
 const {refreshTasks}=require('../lib/data-refresh.ts');
 const table=(rows,head=['Team','TG','CF','CA','O9.5'])=>`<p>Season 2026/27</p><table><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
 const league=()=>({leagues:[{id:'epl',season:'2026/27',cards:{source:'https://cards.example/epl',checkedAt:iso(now),n:1},overview:{source:'https://cards.example/ov',checkedAt:iso(now)},teams:[],corners:[],cornerSource:'https://corners.example/epl'}],refereesByLeague:{},referees:[]});
 const cornersOnly=d=>refreshTasks(d,{}).filter(t=>t.id==='epl:corners');
 const health=d=>dataHealth({...d,refereeUpdates:{}},now).blocks.find(b=>b.key==='corners');
 const pass=async(d,html,status=200)=>{global.fetch=async()=>new Response(html,{status});return runRefresh(d,cornersOnly(d),createSourceReader(store(),{deadline:Date.now()+5000}),now)};
 let cov=league();check(health(cov).state==='missing'&&cov.leagues[0].corners.length===0,'a block without rows is "missing", not zero rows');
 await pass(cov,table([['Arsenal',8,6.1,3.2,55],['Chelsea',8,5.2,4.1,40],['Spurs',8,4.9,4.4,38]]));
 check(cov.leagues[0].corners.length===3&&health(cov).state==='partial'&&health(cov).partial,'3 of 20 teams is reported as partial coverage, not fresh');
 cov=league();await pass(cov,table([['Arsenal',8,6.1,3.2,55],['Chelsea',8,'',4.1,40],['Spurs',8,'-',4.4,38]]));
 check(cov.leagues[0].corners.map(r=>r.name).join()==='Arsenal'&&!cov.leagues[0].corners.some(r=>r.for===0),'rows with a missing value are dropped, never zero-filled');
 check(health(cov).state==='partial','dropped rows leave the block partial');
 const kept=[{name:'Arsenal',n:7,for:6,against:3,over95:50}];
 for(const [label,html,status,error] of [['missing column',table([['Arsenal',8,6.1,55]],['Team','TG','CF','O9.5']),200,'Неполная выдача'],['no corners table','<p>Season 2026/27</p><table><tr><th>Team</th><th>GF</th></tr></table>',200,'Таблица не найдена'],['other season',table([['Arsenal',8,6.1,3.2,55]]).replace('2026/27','2025/26'),200,'Сезон не подтверждён'],['source error','',500,'HTTP 500']]){
  cov=league();cov.leagues[0].corners=structuredClone(kept);cov.leagues[0].cornerCheckedAt=iso(now-BLOCK_INTERVAL);
  await pass(cov,html,status);
  check(cov.blockStatus['epl:corners'].error===error&&cov.leagues[0].corners[0].n===7&&cov.leagues[0].cornerCheckedAt===iso(now-BLOCK_INTERVAL),label+': previous rows and their time are kept');
  check(health(cov).state==='unavailable',label+': block is reported as unavailable');
 }
 cov=league();cov.leagues[0].corners=structuredClone(kept);await pass(cov,table([['Arsenal',6,6.1,3.2,55]]));
 check(cov.blockStatus['epl:corners'].error==='Устаревшая выборка угловых','a smaller sample from the source is rejected');
 check(cov.leagues[0].corners[0].n===7,'rejected sample does not replace saved rows');
 cov=league();delete cov.leagues[0].cornerSource;check(!refreshTasks(cov,{}).some(t=>t.id==='epl:corners')&&health(cov).state==='missing','no source configured: no request, block stays "missing"');

 // Saving is verified by reading back.
 check((await writeVerified(store(),'k',{revision:'1'})).ok,'verified write');
 const lossy={get:async()=>null,put:async()=>{}};
 const lost=await writeVerified(lossy,'k',{revision:'1'});check(!lost.ok&&lost.error.includes('не подтверждена'),'lost write is reported');
 check(!(await writeVerified(undefined,'k',{revision:'1'})).ok,'missing storage is reported');
 check(!(await writeVerified({get:async()=>null,put:async()=>{throw Error('R2')}},'k',{revision:'1'})).ok,'failed write is reported');

 // The route: one pass, failures keep previous values, verified save, schedule respected, lock respected.
 const Data=require('../app/api/data/route.ts');
 env.BUCKET=store();requests=0;let urls=[];global.fetch=async url=>{requests++;urls.push(url);return new Response('',{status:500})};
 const seed=require('../lib/seed.json');const realNow=Date.now;Date.now=()=>realNow()+BLOCK_INTERVAL;
 try{
  let d=await(await Data.GET()).json();
  check(requests>0&&d.persisted?.ok&&d.lastPass.failed>0,'a pass with failing sources still saves and confirms the save');
  check(d.leagues.find(l=>l.id==='epl').cards.checkedAt===seed.leagues.find(l=>l.id==='epl').cards.checkedAt,'a failed block keeps its previous values and time');
  check(d.health.counts.unavailable>0&&d.health.blocks.some(b=>b.state==='unavailable'),'failed blocks are reported as unavailable');
  const failed=new Set(urls);urls=[];const deferred=d.lastPass.deferred;d=await(await Data.GET()).json();
  check(deferred>0&&urls.length>0&&urls.every(u=>!failed.has(u)),'the next pass continues deferred blocks and does not retry failed ones before their schedule');
  env.BUCKET=store();await env.BUCKET.put('cardroom/data-refresh-lock.json',JSON.stringify({until:Date.now()+60000}));requests=0;
  d=await(await Data.GET()).json();check(requests===0&&d.health.inProgress&&d.health.pending>0,'a running pass elsewhere is not duplicated');
  env.BUCKET=lossy;d=await(await Data.GET()).json();check(d.persisted&&!d.persisted.ok&&d.health.persisted.ok===false,'unconfirmed save reaches health');
 }finally{Date.now=realNow}
 const {renderToStaticMarkup}=require('react-dom/server'),React=require('react'),Status=require('../app/update-status.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Status,{data:{leagues:[],health:{...dataHealth({leagues:[]}),pending:3,persisted:{ok:false,error:'Запись не подтверждена при повторном чтении'}}}}));
 check(html.includes('В очереди на проверку: 3')&&html.includes('Сохранение не подтверждено'),'status shows queued blocks and an unconfirmed save');
 console.log('PASS '+n+' data reliability checks: per-block schedule, timeouts, Retry-After and back-off, per-origin limits, pass budget, verified save, single pass, partial coverage, missing fields, wrong season, source errors.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>clearInterval(keep));
