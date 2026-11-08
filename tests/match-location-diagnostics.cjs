/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS offline test harness loads transpiled application modules. */
const fs=require('node:fs'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const env={},load=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env}:load.call(this,id,...args)};
const L=require('../lib/match-location.ts'),U=require('../lib/uefa-officials.ts'),F=require('../lib/fixture-display.ts');
const React=require('react'),render=require('react-dom/server').renderToStaticMarkup,Overview=require('../app/match-overview.tsx').default;
let checks=0;const check=(v,s)=>{assert.ok(v,s);checks++};
const originalNow=Date.now;let now=Date.parse('2026-11-08T12:24:00Z');Date.now=()=>now;
const id='401915380',league='ucl',date='2026-11-24T17:45:00Z',source='https://www.uefa.com/uefachampionsleague/news/02a9-218880e7a2aa-96adf63aa534-1000--who-is-the-referee-which-officials-are-in-charge-of-the-uefa/';
// Minimal provider-shaped fixture, preserving the audited ESPN venue fields. No real appointment is asserted.
const raw={id,league,date,home:'Bodo/Glimt',away:'LASK Linz',referee:null,venue:'Aspmyra Stadion',city:'Bodø/Glimt',country:'Norway',state:'pre'};
const canonical=L.normalizeMatchLocation(raw);
check(canonical.city==='Bodø'&&canonical.venueCityOriginal==='Bodø/Glimt'&&canonical.venueCitySource==='https://www.glimt.no/om-stadion/adkomst','verified stadium location is canonical with source and original value');
check(raw.city==='Bodø/Glimt'&&L.normalizeMatchLocation(canonical)===canonical,'normalization is immutable and idempotent');
for(const changed of [{venue:'Unknown Stadium'},{country:'Sweden'},{city:'Oslo'},{venue:null},{country:null},{city:null}]){const m={...raw,...changed};check(L.normalizeMatchLocation(m)===m,'unrelated or missing location is not inferred: '+JSON.stringify(changed))}
check(L.normalizeMatchLocation({...raw,home:'Another club'}).city==='Bodø','venue correction does not depend on home team');
check(L.normalizeMatchLocation({...raw,city:'Bodo/Glimt'}).city==='Bodø','provider ASCII spelling has the same scoped correction');
const venue=L.venueFields({id:'1510',fullName:raw.venue,address:{city:raw.city,country:raw.country}});
check(venue.city==='Bodø'&&venue.venueCityOriginal===raw.city&&!('venueLatitude' in venue),'upstream parser corrects city without inventing stadium coordinates');
check(L.matchLocation(raw)==='Aspmyra Stadion · Bodø · Norway','formatter corrects saved raw location before detail fetch');
let merged=F.withAppointment(raw,{...raw,...venue,lastAttemptAt:'2026-11-08T12:24:00Z'});
check(merged.city==='Bodø'&&merged.venueCitySource===canonical.venueCitySource,'UI merge retains correction provenance');
for(const partial of [{venue:raw.venue},{country:raw.country},{city:'Bodø'}])check(F.withAppointment(canonical,{id,league,...partial}).venueCitySource===canonical.venueCitySource,'same partial location preserves prior correction source');
merged=F.withAppointment(canonical,{...raw,venue:'Other Stadium',city:'Oslo'});
check(merged.city==='Oslo'&&!merged.venueCitySource&&!merged.venueCityOriginal,'different incoming venue removes obsolete correction attribution');
const success={rows:[],source,stale:false,checkedAt:'2026-11-08T12:00:00Z'},failure={...success,stale:true,error:'Error: secret sentinel',lastAttemptAt:'2026-11-08T12:24:00Z'};
const missing=U.applyUEFAOfficials(raw,success),failed=U.applyUEFAOfficials(raw,failure);
check(missing.referee===null&&missing.appointmentError===null&&missing.appointmentLastAttempt===success.checkedAt,'successful absent official row records the actual check without error');
check(failed.referee===null&&failed.appointmentError==='Не удалось проверить официальный список UEFA.'&&failed.appointmentLastAttempt===failure.lastAttemptAt,'failed official check is distinct and retains actual attempt time');
check(!JSON.stringify(failed).includes('secret sentinel'),'raw exception is not exposed');
check(U.applyUEFAOfficials({...raw,error:'Summary unavailable'},success).appointmentError==='Не удалось проверить имя арбитра в данных матча.','successful empty official list does not hide a failed summary');
const summaryFailure=U.applyUEFAOfficials({...raw,error:'Summary unavailable',lastAttemptAt:'2026-11-08T12:24:00Z'},success);
check(summaryFailure.appointmentLastAttempt==='2026-11-08T12:24:00Z','summary error uses its own recent attempt time, not older official list time');
check(F.withAppointment({...missing,appointmentLastAttempt:'2026-11-08T12:10:00Z',appointmentDiagnosticAt:'2026-11-08T12:10:00Z'},summaryFailure).appointmentError===summaryFailure.appointmentError,'older successful official check cannot suppress a newer summary failure');
const summaryRecovery=U.applyUEFAOfficials({...raw,lastAttemptAt:'2026-11-08T12:30:00Z'},success),recoveredSummaryView=F.withAppointment(summaryFailure,summaryRecovery);
check(recoveredSummaryView.appointmentError===null&&recoveredSummaryView.appointmentLastAttempt==='2026-11-08T12:30:00Z','successful summary recovery clears its error even with an unchanged cached official list');
check(success.checkedAt==='2026-11-08T12:00:00Z'&&!summaryRecovery.appointmentCheckedAt&&!summaryRecovery.referee,'summary recovery never renews official success time or invents an appointment');

const bothFailures=U.applyUEFAOfficials({...raw,error:'Summary unavailable',lastAttemptAt:'2026-11-08T12:25:00Z'},failure);
check(bothFailures.appointmentLastAttempt==='2026-11-08T12:25:00Z'&&bothFailures.appointmentError===summaryFailure.appointmentError,'two failed sources report the latest failed attempt with its matching message');
const partialRecovery=U.applyUEFAOfficials({...raw,lastAttemptAt:'2026-11-08T12:30:00Z'},failure),partialView=F.withAppointment(bothFailures,partialRecovery);
check(partialView.appointmentError==='Не удалось проверить официальный список UEFA.'&&partialView.appointmentLastAttempt==='2026-11-08T12:24:00Z','summary recovery switches to still-failed official source with its original failed-attempt time');
check(partialView.appointmentDiagnosticAt==='2026-11-08T12:30:00Z'&&failure.checkedAt==='2026-11-08T12:00:00Z','combined diagnostic ordering records actual newest evidence without renewing official success');
check(F.withAppointment(partialView,bothFailures).appointmentError===partialView.appointmentError,'old combined failure cannot return after partial recovery');
const completeRecovery=U.applyUEFAOfficials({...raw,lastAttemptAt:'2026-11-08T12:30:00Z'},{...success,checkedAt:'2026-11-08T12:31:00Z'});
check(F.withAppointment(partialView,completeRecovery).appointmentError===null,'later official recovery clears the remaining failed-source diagnostic');

const staleLocation=L.normalizeMatchLocation({...canonical,venue:'Other Stadium',city:'Oslo'});
check(!staleLocation.venueCityOriginal&&!staleLocation.venueCitySource,'normalizer removes inherited correction metadata after a venue change');

const known={...raw,referee:'SYNTHETIC REFEREE',appointmentSource:'https://www.uefa.com/uefachampionsleague/match/2049629--bodo-glimt-vs-lask/',appointmentType:'UEFA · официальное назначение',appointmentCheckedAt:'2026-11-08T11:00:00Z',currentVerified:true};
for(const report of [success,failure])check(U.applyUEFAOfficials(known,report)===known,'absent row does not revoke named appointment or renew its success timestamp');
merged=F.withAppointment(raw,failed);
check(merged.appointmentError===failed.appointmentError&&merged.appointmentLastAttempt===failure.lastAttemptAt,'missing-referee merge propagates error and its actual check time');
const recovered=F.withAppointment(merged,{...missing,appointmentLastAttempt:'2026-11-08T12:25:00Z',appointmentDiagnosticAt:'2026-11-08T12:25:00Z'});
check(recovered.appointmentError===null&&!recovered.referee,'later successful no-row check clears failure without inventing an appointment');
check(F.withAppointment(recovered,failed).appointmentError===null&&F.withAppointment(recovered,failed).appointmentLastAttempt===recovered.appointmentLastAttempt,'older failed check cannot replace newer successful diagnostic');
check(F.withAppointment(recovered,{id,league,referee:null,appointmentError:'old undated error'}).appointmentError===null,'undated error cannot replace a dated diagnostic');
check(F.withAppointment(raw,{id,league,referee:null,error:'offline',lastAttemptAt:failure.lastAttemptAt}).appointmentError==='Не удалось проверить назначение арбитра.','summary-only failure reaches missing-referee UI safely');
check(F.withAppointment(known,{...failed}).referee===known.referee&&F.withAppointment(known,{...failed}).appointmentCheckedAt===known.appointmentCheckedAt,'failed detail never erases confirmed name or success timestamp');
for(const m of [canonical,merged,recovered]){const html=render(React.createElement(Overview,{match:m,leagueName:'Лига чемпионов'}));check(html.includes('Aspmyra Stadion · Bodø · Norway')&&!html.includes('Aspmyra Stadion · Bodø/Glimt'),'overview always renders actual city');check(html.includes('Источник города'),'verified correction has a visible source')}
const badHtml=render(React.createElement(Overview,{match:merged})),goodHtml=render(React.createElement(Overview,{match:recovered}));
check(badHtml.includes('Проверка назначения не завершена')&&badHtml.includes(failed.appointmentError)&&!badHtml.includes('Источник ещё не передал имя'),'failure copy does not claim a successful source response');
check(goodHtml.includes('Источник ещё не передал имя')&&!goodHtml.includes(failed.appointmentError),'successful missing data has distinct neutral copy');
const values=new Map(),calls=[];env.BUCKET={get:async key=>values.has(key)?{json:async()=>structuredClone(values.get(key))}:null,put:async(key,text)=>values.set(key,JSON.parse(text))};
const summary={header:{id,league:{slug:'uefa.champions'},competitions:[{id,date,status:{type:{state:'pre',name:'STATUS_SCHEDULED',completed:false}},competitors:[{homeAway:'home',team:{id:'2980',displayName:raw.home}},{homeAway:'away',team:{id:'4411',displayName:raw.away}}]}]},gameInfo:{venue:{id:'1510',fullName:raw.venue,address:{city:raw.city,country:raw.country}}}};
let summaryFails=false;
global.fetch=async url=>{url=String(url);calls.push(url);if(url.includes('/summary?event='+id)){if(summaryFails)return new Response('',{status:503});return Response.json(summary)}if(url.includes('geocoding-api.open-meteo.com')){check(new URL(url).searchParams.get('name')==='Bodø','weather requests corrected city');return Response.json({results:[{id:3160881,name:'Bodø',country:'Norway',country_code:'NO',feature_code:'PPLA',latitude:67.28267,longitude:14.37513}]})}if(url.includes('api.open-meteo.com/v1/forecast'))return Response.json({hourly:{time:[Date.parse('2026-11-24T18:00:00Z')/1000],temperature_2m:[4],wind_speed_10m:[2]}});throw Error('Unexpected external request blocked: '+url)};
const seedReport=(report=success)=>values.set('official-appointments/uefa/2026-27/v1.json',{...report,nextCheckAt:new Date(now+3600000).toISOString()});
const Route=require('../app/api/match/route.ts'),Weather=require('../app/api/weather/route.ts'),req=new Request('https://offline.invalid/api/match?id='+id+'&league=ucl');
(async()=>{
 seedReport();let details=await(await Route.GET(req)).json();
 check(details.city==='Bodø'&&details.venueCityOriginal===raw.city&&details.referee===null,'actual fresh match route corrects venue and leaves unavailable referee null');
 values.set('match/v6/ucl/'+id+'.json',{...raw,fetchedAt:new Date(now).toISOString()});const before=calls.length;details=await(await Route.GET(req)).json();
 check(calls.length===before&&details.city==='Bodø','legacy cached match normalizes without provider request or cache rewrite');
 check(values.get('match/v6/ucl/'+id+'.json').city===raw.city,'read normalization does not migrate existing stored cache');
 seedReport(failure);details=await(await Route.GET(req)).json();check(details.appointmentError==='Не удалось проверить официальный список UEFA.','cached route surfaces failed official check');
 now+=31*60000;seedReport(failure);summaryFails=true;const warn=console.warn;console.warn=()=>{};try{details=await(await Route.GET(req)).json()}finally{console.warn=warn}
 check(details.city==='Bodø'&&details.stale&&details.referee===null&&details.appointmentError==='Не удалось проверить имя арбитра в данных матча.','fallback retains canonical city and newest failed check without new referee');
 summaryFails=false;seedReport();values.set('match/v6/ucl/'+id+'.json',{...known,...canonical,referee:known.referee,fetchedAt:'2026-11-08T10:00:00Z'});const originalVenue=summary.gameInfo.venue;
 summary.gameInfo.venue={fullName:'Other Stadium',address:{city:'Oslo',country:'Norway'}};
 details=await(await Route.GET(req)).json();check(details.referee===known.referee&&details.city==='Oslo'&&!details.venueCitySource&&!details.venueCityOriginal,'fresh route retaining prior referee cannot retain prior venue correction attribution');summary.gameInfo.venue=originalVenue;
 now=Date.parse('2026-11-09T00:00:00Z');seedReport();values.delete('match/v6/ucl/'+id+'.json');values.delete('referee-updates/source-backoff/site.api.espn.com.json');
 const weather=await(await Weather.GET(new Request('https://offline.invalid/api/weather?id='+id+'&league=ucl'))).json();
 check(weather.status==='available'&&weather.city==='Bodø'&&weather.scope==='city','actual weather route uses canonical city when forecast window opens');
 check(weather.locationSource==='https://www.geonames.org/'&&weather.temperature===4,'city coordinates and synthetic forecast retain their own provenance, not stadium scope');
 Date.now=originalNow;console.log(`PASS ${checks} match location and referee diagnostic assertions: scoped identity, UI, cached/fallback, weather and source failure/recovery.`);
})().catch(e=>{Date.now=originalNow;console.error(e);process.exitCode=1});
