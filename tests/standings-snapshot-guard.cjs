/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node regression harness. */
const fs=require('node:fs'),assert=require('node:assert/strict'),Module=require('node:module'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {installClock}=require('./helpers/test-clock.cjs'),clock=installClock(Date.parse('2026-11-08T12:00:00Z'),{timers:false});
const rows=new Map(),writes=[],bucket={get:async key=>rows.has(key)?{json:async()=>structuredClone(rows.get(key))}:null,put:async(key,value)=>{writes.push(key);rows.set(key,JSON.parse(value))}};
const original=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env:{BUCKET:bucket}}:original.call(this,id,...args)};
const {parseLeagueTable,validateLeagueTable,loadLeagueTable,emptyLeagueTable}=require('../lib/league-table.ts');
const {cachedLeagueData}=require('../lib/league-data-cache.ts'),{SourceStamp}=require('../app/league-explorer.tsx'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
let checks=0;const check=(v,label)=>{assert.ok(v,label);checks++},reject=(fn,reason)=>{assert.throws(fn,error=>error.reason===reason);checks++};
const row=(i,played=3)=>({team:{id:String(100+i),displayName:'Club '+i},stats:Object.entries({rank:i+1,gamesPlayed:played,wins:played-2,ties:1,losses:1,pointsFor:2,pointsAgainst:4,pointDifferential:-2,points:(played-2)*3+1}).map(([name,value])=>({name,value}))});
const doc=(count=20,played=3,uid='700',season=2026)=>({uid:'s:600~l:'+uid,children:[{name:'League',standings:{season,entries:Array.from({length:count},(_,i)=>row(i,played))}}]});
const goodAt='2026-11-08T10:00:00Z',good=()=>parseLeagueTable(doc(),'epl',2026,goodAt),parse=(d=doc())=>parseLeagueTable(d,'epl',2026),policy={validate:(v,old)=>validateLeagueTable(v,'epl',2026,old)},empty=()=>emptyLeagueTable('epl',2026);
const run=(key,load)=>cachedLeagueData(bucket,key,1800000,load,empty,policy);
(async()=>{
 try{
  global.fetch=async()=>{throw Error('Unexpected external request')};
  reject(()=>parse({...doc(),children:[]}),'empty');reject(()=>parse(doc(0)),'empty');
  const mixed=doc();mixed.children.push({name:'Empty group',standings:{season:2026,entries:[]}});reject(()=>parse(mixed),'empty');
  reject(()=>validateLeagueTable(parse(doc(19)),'epl',2026),'incomplete');
  reject(()=>validateLeagueTable(parse(doc(21)),'epl',2026),'incomplete');
  const badFields=doc();badFields.children[0].standings.entries[0].stats=[];const parsedMissing=parse(badFields);check(parsedMissing.groups[0].entries[0].points===null,'missing numbers remain null in parser');reject(()=>validateLeagueTable(parsedMissing,'epl',2026),'incomplete');
  const repeated=good();repeated.groups.push(structuredClone(repeated.groups[0]));reject(()=>validateLeagueTable(repeated,'epl',2026),'invalid');
  const wrongDirectory=good();wrongDirectory.teams[0].id='99999';reject(()=>validateLeagueTable(wrongDirectory,'epl',2026),'invalid');
  const fractional=good();fractional.groups[0].entries[0].played=3.5;reject(()=>validateLeagueTable(fractional,'epl',2026),'incomplete');
  for(const key of ['league','season','source','checkedAt']){const value=good();value[key]=key==='season'?2025:key==='checkedAt'?'2027-01-01T00:00:00Z':'wrong';reject(()=>validateLeagueTable(value,'epl',2026),'invalid')}
  const accepted=validateLeagueTable(good(),'epl',2026);check(accepted.coverage.complete&&accepted.coverage.teams===20&&accepted.checkedAt===goodAt,'full snapshot has explicit count and original time');
  const previousSeason=parseLeagueTable(doc(18,3,'700',2025),'epl',2025,goodAt);check(validateLeagueTable(previousSeason,'epl',2025).coverage.complete===null,'unconfigured older formats are not falsely marked complete');
  const zero=doc(20,2);for(const entry of zero.children[0].standings.entries){for(const stat of entry.stats)if(stat.name!=='rank')stat.value=0}check(validateLeagueTable(parse(zero),'epl',2026).groups[0].entries[0].played===0,'pre-season observed zeros are valid');
  const deduction=good();deduction.groups[0].entries[0].points=-5;check(validateLeagueTable(deduction,'epl',2026).groups[0].entries[0].points===-5,'official deducted points are not recalculated');
  reject(()=>validateLeagueTable(parse(doc(20,2)),'epl',2026,good()),'regression');
  const replacement=parse();replacement.groups[0].entries[0].id='99999';replacement.teams[0].id='99999';reject(()=>validateLeagueTable(replacement,'epl',2026,good()),'regression');
  for(const [name,load,reason] of [['empty',async()=>parse(doc(0)),'empty'],['truncated',async()=>parse(doc(19)),'incomplete'],['missing-fields',async()=>parse(badFields),'incomplete'],['regressed',async()=>parse(doc(20,2)),'regression']]){
   const key='test/standings/'+name;rows.set(key,good());const before=JSON.stringify(rows.get(key)),count=writes.length,value=await run(key,load);
   check(value.stale&&value.checkedAt===goodAt&&value.teams.length===20&&value.failureReason===reason,name+' keeps last confirmed rows/time');
   check(value.attemptedAt==='2026-11-08T12:00:00.000Z'&&value.nextCheckAt==='2026-11-08T12:01:00.000Z',name+' labels failed attempt independently');
   check(writes.length===count&&JSON.stringify(rows.get(key))===before,name+' does not replace persisted snapshot');
  }
  let calls=0;const noPrevious=await run('test/no-previous',async()=>{calls++;return parse(doc(19))});check(!noPrevious.stale&&noPrevious.checkedAt===null&&noPrevious.teams.length===0&&noPrevious.failureReason==='incomplete','first partial response cannot masquerade as confirmed data');
  await run('test/no-previous',async()=>{calls++;return parse()});check(calls===1,'validation failure has bounded retry');
  rows.set('test/legacy-empty',{...empty(),checkedAt:'2026-11-08T11:59:59Z'});const legacy=await run('test/legacy-empty',async()=>{throw Error('token=DO_NOT_EXPOSE')});check(legacy.checkedAt===null&&!legacy.stale&&!JSON.stringify(legacy).includes('DO_NOT_EXPOSE'),'fresh invalid legacy record is not trusted and errors are redacted');
  const blockedKey='test/backoff',until=Date.now()+6*3600000;rows.set(blockedKey,good());let blockedCalls=0;
  const blocked=await run(blockedKey,async()=>{blockedCalls++;throw Object.assign(Error('HTTP 403'),{retryAfter:until})});check(blocked.checkedAt===goodAt&&blocked.nextCheckAt===new Date(until).toISOString(),'provider cooldown is preserved without changing data age');
  await clock.advance(120000);await run(blockedKey,async()=>{blockedCalls++;return parse()});check(blockedCalls===1,'no source retry before provider cooldown');

  const recoverKey='test/recovery';rows.set(recoverKey,good());await run(recoverKey,async()=>parse(doc(19)));await clock.advance(61000);const recovered=await run(recoverKey,async()=>parse(doc(20,4)));
  check(recovered.checkedAt===new Date().toISOString()&&!recovered.stale&&!recovered.error&&recovered.groups[0].entries[0].played===4&&rows.get(recoverKey).checkedAt===recovered.checkedAt,'complete recovery replaces data and clears failed-attempt metadata');
  const newer=parse(doc(20,5)),raceKey='test/newer';newer.checkedAt=new Date(Date.now()+1000).toISOString();rows.set(raceKey,good());const race=await run(raceKey,async()=>{rows.set(raceKey,newer);return parse(doc(20,4))});check(race.checkedAt===newer.checkedAt&&rows.get(raceKey).groups[0].entries[0].played===5,'newer persisted snapshot observed after I/O wins');
  // A newer timestamp alone cannot make regressed durable data outrank memory.
  const monotonicKey='test/monotonic';await run(monotonicKey,async()=>parse(doc(20,10)));await clock.advance(1800001);
  const regressed=parse(doc(20,3));rows.set(monotonicKey,regressed);let attempted=0;
  const monotonic=await run(monotonicKey,async()=>{attempted++;throw Error('offline')});
  check(attempted===1&&monotonic.groups[0].entries[0].played===10&&monotonic.stale,'R2 with newer timestamp but fewer games never displaces known memory');
  const oldKey='test/older-season',oldPolicy={validate:(v,previous)=>validateLeagueTable(v,'epl',2025,previous)},oldEmpty=()=>emptyLeagueTable('epl',2025),oldRun=load=>cachedLeagueData(bucket,oldKey,1800000,load,oldEmpty,oldPolicy);
  await oldRun(async()=>parseLeagueTable(doc(20,10,'700',2025),'epl',2025));await clock.advance(1800001);rows.set(oldKey,parseLeagueTable(doc(1,3,'700',2025),'epl',2025));
  const older=await oldRun(async()=>{throw Error('offline')});check(older.teams.length===20&&older.stale,'unknown historical format still preserves known team coverage against regressed R2');
  const afterErrorKey='test/error-race';rows.set(afterErrorKey,good());const errorRace=await run(afterErrorKey,async()=>{rows.set(afterErrorKey,parse(doc(20,11)));throw Object.assign(Error('HTTP 403'),{retryAfter:Date.now()+21600000})});
  check(errorRace.groups[0].entries[0].played===11,'a concurrent success is reread even when our source call fails');
  await clock.advance(61000);const updateDuringCooldown=parse(doc(20,12));rows.set(afterErrorKey,updateDuringCooldown);let forbidden=0;
  const duringCooldown=await run(afterErrorKey,async()=>{forbidden++;throw Error('must not fetch')});
  check(forbidden===0&&duringCooldown.groups[0].entries[0].played===12&&duringCooldown.checkedAt===updateDuringCooldown.checkedAt&&!duringCooldown.error&&!duringCooldown.stale,'cooldown reads newer R2 and clears failure from before that snapshot without source I/O');
  await clock.advance(1);rows.set(afterErrorKey,parse(doc(20,3)));const stillRetained=await run(afterErrorKey,async()=>{forbidden++;throw Error('must not fetch')});
  check(forbidden===0&&stillRetained.groups[0].entries[0].played===12,'snapshot learned during cooldown cannot be erased by a later regressed R2 write');
  const coldKey='test/cold-memory';const coldSnapshot=parse();rows.set(coldKey,coldSnapshot);await run(coldKey,async()=>{throw Error('fresh cache should suffice')});
  await clock.advance(1800001);const get=bucket.get;bucket.get=async()=>{throw Error('storage unavailable')};
  const retainedCold=await run(coldKey,async()=>{throw Error('source unavailable')});bucket.get=get;
  check(retainedCold.teams.length===20&&retainedCold.checkedAt===coldSnapshot.checkedAt&&retainedCold.stale,'previously read R2 snapshot survives subsequent storage and source failure');
  const profileStamp=renderToStaticMarkup(React.createElement(SourceStamp,{value:{...good(),stale:true,checkedAt:new Date().toISOString()},kind:'profile'}));
  check(profileStamp.includes('профиль собран')&&!profileStamp.includes('данные подтверждены'),'profile assembly timestamp is never labelled source confirmation');
  const markup=renderToStaticMarkup(React.createElement(SourceStamp,{value:blocked}));check(markup.includes('данные подтверждены')&&markup.includes('последняя попытка')&&markup.includes('повтор не ранее')&&markup.includes('сохранённый срез'),'UI distinguishes saved evidence, failed attempt and retry time');
  const absent=renderToStaticMarkup(React.createElement(SourceStamp,{value:noPrevious}));check(absent.includes('подтверждённого среза нет')&&!absent.includes('данные подтверждены'),'missing data gets no false success stamp');
  const key='league-table/v1/seriea/2026.json';rows.set(key,parseLeagueTable(doc(20,3,'730'),'seriea',2026,goodAt));const bytes=JSON.stringify(rows.get(key));let fetches=0;
  global.fetch=async url=>{fetches++;check(String(url).includes('/ita.1/standings?season=2026'),'real loader keeps fixed provider/season');return Response.json(doc(4,3,'730'))};
  const route=await loadLeagueTable(bucket,'seriea',2026);check(fetches===1&&route.stale&&route.teams.length===20&&route.checkedAt===goodAt&&JSON.stringify(rows.get(key))===bytes,'real standings loader quarantines truncated HTTP 200');
  console.log(`PASS ${checks} standings snapshot checks: empty/truncated/malformed data, legacy cache, same-season regression, timestamps, retry, recovery, concurrent saved response and UI labels.`);
 }finally{clock.restore()}
})().catch(error=>{console.error(error);process.exitCode=1});
