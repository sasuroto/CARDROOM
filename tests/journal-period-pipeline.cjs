/* eslint-disable @typescript-eslint/no-require-imports -- Standalone offline regression harness. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite'),{installClock}=require('./helpers/test-clock.cjs');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const clock=installClock(Date.parse('2026-11-08T08:00:00Z'),{timers:false});
const originalLoad=Module._load,originalTs=require.extensions['.ts'],originalFetch=global.fetch;
const env={},values=new Map(),sql=new DatabaseSync(':memory:');
let checks=0,fetches=0,raw,offline=false;
const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++};
const load=f=>require(path.join(root,f));
(async()=>{try{
 require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
 Module._load=function(id,...args){return id==='cloudflare:workers'?{env}:originalLoad.call(this,id,...args)};
 sql.exec(fs.readFileSync(path.join(root,'drizzle/0000_tough_mathemanic.sql'),'utf8'));
 env.DB={prepare(query){const statement=sql.prepare(query);const methods=args=>({run:async()=>statement.run(...args),first:async()=>statement.get(...args)||null,all:async()=>({results:statement.all(...args)})});return {...methods([]),bind:(...args)=>methods(args)}}};
 env.BUCKET={get:async key=>values.has(key)?{json:async()=>structuredClone(values.get(key))}:null,put:async(key,value)=>values.set(key,JSON.parse(value))};
 const id='888900112',league='primeira',kickoff='2026-11-07T19:00:00.000Z';
 const makeRaw=period=>({header:{id,league:{slug:'por.1',name:'Synthetic league'},season:{year:2026,name:'2026/27'},competitions:[{id,date:kickoff,status:{period,displayClock:'90',type:{state:'post',name:'STATUS_FULL_TIME',shortDetail:'FT'}},competitors:[{homeAway:'home',team:{id:'1',displayName:'Home'},score:'2'},{homeAway:'away',team:{id:'2',displayName:'Away'},score:'1'}]}]},gameInfo:{officials:[]}});
 global.fetch=async url=>{fetches++;if(offline)throw Error('synthetic offline');const u=new URL(url);if(u.pathname.endsWith('/summary'))return Response.json(raw);if(u.pathname.endsWith('/schedule'))return Response.json({team:{id:u.pathname.match(/teams\/(\d+)/)[1]},events:[]});throw Error('Unexpected synthetic provider URL: '+u.pathname)};
 const A=load('app/api/analysis/route.ts'),Match=load('app/api/match/route.ts'),M=load('lib/results-model.ts'),J=load('lib/results-journal.ts'),F=load('lib/fixtures.ts'),S=load('lib/match-status-evidence.ts'),C=load('lib/calendar-refresh.ts');
 const analysisKey=`analysis/v12/${league}/${id}.json`,matchKey=`match/v6/${league}/${id}.json`;
 const request=async route=>(await route.GET(new Request(`https://synthetic.invalid/api/analysis?id=${id}&league=${league}`))).json();
 const observations=()=>sql.prepare('SELECT * FROM journal_observations ORDER BY checked_at,kind').all();
 const latest=kind=>JSON.parse(sql.prepare('SELECT payload FROM journal_observations WHERE kind=? ORDER BY checked_at DESC LIMIT 1').get(kind).payload);
 const f={id,league,kickoff,home:'Home',away:'Away',homeId:'1',awayId:'2',picks:[{metric:'goals',choice:'over',line:2.5,probability:.6,dotSelected:true}]};
 const forecastBytes=JSON.stringify(f,null,2);
 sql.prepare('INSERT INTO journal_forecasts VALUES (?,?,?,?,?)').run(`${league}:${id}`,league,'2026-11-07','2026-11-07T18:00:00Z',forecastBytes);
 const outcome=o=>M.evaluatePick(f,f.picks[0],[o]).state;
 // The real analysis pipeline already preserves numeric period 2 on production v115.
 raw=makeRaw(2);let response=await request(A);
 equal([response.period,response.journal.persisted,latest('analysis').period,outcome(latest('analysis'))],[2,true,2,'hit'],'actual summary -> analysis route -> real SQLite preserves verified period');
 const originalRows=observations();const originalForecast=sql.prepare('SELECT * FROM journal_forecasts').get();
 const beforeFetch=fetches;await request(A);equal(fetches,beforeFetch,'fresh cache requires no provider fetch');equal(observations(),originalRows,'cache replay is idempotent');
 // Legacy cache is read as-is: missing period remains unknown, timestamps never renewed.
 await clock.advance(1000);const legacy={...response,checkedAt:new Date().toISOString()};delete legacy.period;delete legacy.journal;values.set(analysisKey,legacy);
 response=await request(A);equal(response.period,undefined,'legacy cache does not invent period');equal(outcome(latest('analysis')),'excluded','unknown latest report is excluded');equal(response.checkedAt,legacy.checkedAt,'cache time remains original');equal(fetches,beforeFetch,'legacy cache retains normal TTL');
 const legacyRows=observations();await request(A);equal(observations(),legacyRows,'unknown cached observation deduplicates');
 await clock.advance(301000);offline=true;response=await request(A);equal([response.stale,response.checkedAt],[true,legacy.checkedAt],'expired cache on failure remains stale with old time');equal(observations(),legacyRows,'failure fallback never records fresh journal evidence');
 // A genuinely new verified response appends a correction, never rewrites history.
 offline=false;raw=makeRaw(2);response=await request(A);equal([response.period,outcome(latest('analysis'))],[2,'hit'],'new verified response recovers through a new revision');
 for(const old of legacyRows)equal(sql.prepare('SELECT * FROM journal_observations WHERE id=?').get(old.id),old,'every historical observation remains byte-identical');
 equal(sql.prepare('SELECT * FROM journal_forecasts').get(),originalForecast,'original forecast bytes unchanged');
 for(const period of [null,undefined,'2',3,4]){await clock.advance(301000);raw=makeRaw(period);response=await request(A);equal(outcome(latest('analysis')),'excluded',`analysis unknown/non-numeric/extra period ${period} is excluded`)}
 for(const patch of [{statusName:'STATUS_FINAL_PEN',period:2},{statusDetail:'After extra time',period:2},{homeId:'99',period:2}])equal(outcome({...latest('analysis'),...patch}),'excluded','status and identity guards stay enforced');
 await clock.advance(301000);raw=makeRaw(2);raw.header.id='999999';raw.header.competitions[0].id='999999';const rowsBeforeMismatch=observations();response=await request(A);equal(response.stale,true,'different event summary rejected');equal(observations(),rowsBeforeMismatch,'different event cannot write journal');
 // Exercise the actual match route: formerly discarded period/IDs before status normalization.
 raw=makeRaw(2);values.delete(matchKey);response=await request(Match);
 equal([response.period,response.homeId,response.awayId],[2,'1','2'],'match route carries period and team IDs from the same summary');
 const current={...response,homeScore:'2',awayScore:'1',statusCheckedAt:new Date().toISOString(),statusStale:false};
 await clock.advance(1000);const incoming={...current,period:4,homeId:'9',awayId:'8',homeScore:'4',statusCheckedAt:new Date().toISOString()};
 equal(S.mergeMatchStatus(current,incoming).period,4,'accepted status replaces period rather than retaining prior regular time');
 equal(S.mergeMatchStatus(current,{...incoming,period:undefined,homeId:undefined,awayId:undefined}).period,null,'accepted incomplete status cannot retain prior period');
 equal(S.mergeMatchStatus(current,{...incoming,period:'2'}).period,null,'numeric string is not fabricated numeric evidence');
 const older={...incoming,statusCheckedAt:'2026-11-07T20:00:00Z'};
 for(const merged of [S.mergeMatchStatus(current,older),C.mergeCalendarEvents([current],[older])[0]])equal([merged.period,merged.homeId,merged.awayId,merged.homeScore],[2,'1','2','2'],'rejected old status cannot mix its period or IDs with newer score');
 const malformed={...incoming,state:'garbage',statusStale:true};equal(C.mergeCalendarEvents([current],[malformed])[0].period,2,'failed status retains prior coherent evidence');
 const e=F.fixture({id,date:kickoff,status:raw.header.competitions[0].status,competitions:raw.header.competitions},league);await J.recordCalendar(env.DB,[e]);equal([latest('score').period,latest('score').homeId,latest('score').awayId],[2,'1','2'],'actual fixture normalizer -> calendar capture -> SQLite preserves evidence');
 equal(sql.prepare('SELECT * FROM journal_forecasts').get(),originalForecast,'all flows preserve forecast bytes');
 await clock.advance(301000);const until=Date.now()+3600000;values.set('referee-updates/source-backoff/site.api.espn.com.json',{until,status:429});
 const beforeBackoff=fetches,beforeBackoffRows=observations(),cachedBeforeBackoff=structuredClone(values.get(analysisKey));response=await request(A);
 equal(fetches,beforeBackoff,'saved provider backoff prevents any upstream request');equal(response.stale,true,'backoff fallback is not presented as fresh');equal(response.checkedAt,cachedBeforeBackoff.checkedAt,'backoff does not advance successful snapshot time');equal(observations(),beforeBackoffRows,'backoff does not append fabricated fresh observation');equal(values.get(analysisKey),cachedBeforeBackoff,'backoff does not rewrite cached raw payload');
 console.log(`PASS ${checks} journal period pipeline checks; actual routes, synthetic provider, real in-memory SQLite.`);
 }finally{sql.close();clock.restore();Module._load=originalLoad;require.extensions['.ts']=originalTs;global.fetch=originalFetch}
})().catch(error=>{console.error(error);process.exitCode=1});
