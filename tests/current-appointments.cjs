const fs=require('node:fs'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {applyCurrentAppointment}=require('../lib/current-context.ts');
const {attachRefereeUpdates}=require('../lib/referee-updates.ts');
const {withAppointment}=require('../lib/fixture-display.ts');
const records=require('../lib/current-match-updates.json').matches.filter(m=>m.date.startsWith('2026-10-18'));
const realNow=Date.now;Date.now=()=>Date.parse('2026-10-18T13:30:00Z');
let n=0;const check=(v,label)=>{assert.ok(v,label);n++};
(async()=>{
 check(records.length===23&&new Set(records.map(m=>m.id)).size===23,'23 distinct official notices for today');
 const events=records.map(m=>({id:m.id,league:m.league,date:m.date,home:m.home,away:m.away,homeScore:'2',awayScore:'1',state:'in',checkedAt:'2026-10-18T13:29:00Z'}));
 const cached=await attachRefereeUpdates(events,undefined);
 for(let i=0;i<records.length;i++){
  const r=records[i],e=cached[i];
  check(e.referee===r.officials.referee&&e.currentVerified&&e.appointmentSource===r.source&&e.appointmentCheckedAt===r.checkedAt,'calendar enriches '+r.id+' with actual source time');
  check(e.homeScore==='2'&&e.awayScore==='1'&&e.state==='in'&&e.checkedAt===events[i].checkedAt,'appointment preserves live match state '+r.id);
 }
 const event=events[0];
 for(const change of [{league:'epl'},{date:'2026-10-19T12:00:00Z'},{id:'999999999'}]){
  const wrong={...event,...change};check(applyCurrentAppointment(wrong)===wrong,'identity mismatch does not import appointment');
 }
 const newer={...event,referee:'Later confirmed official',currentVerified:true,appointmentCheckedAt:'2026-10-18T13:29:00Z'};
 check(applyCurrentAppointment(newer)===newer,'newer official confirmation wins');
 const french=cached.find(m=>m.league==='ligue1');
 check(french.videoOfficials?.length===2&&!french.var&&!french.avar,'video officials do not acquire guessed roles');
 check(withAppointment({id:french.id,league:french.league},french).videoOfficials.length===2,'details retain video officials');
 const {renderToStaticMarkup}=require('react-dom/server'),React=require('react');
 const Overview=require('../app/match-overview.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Overview,{match:french,leagueName:'Ligue 1'}));
 check(html.includes('Видеобригада (роли не уточнены)')&&french.videoOfficials.every(name=>html.includes(name)),'overview renders both officially named video officials');
 Date.now=()=>Date.parse('2026-10-20T13:30:00Z');
 check(applyCurrentAppointment(event)===event,'expired manual notice is not marked current');
 console.log('PASS '+n+' current appointment assertions: cached calendars, identity, timestamps, priority, expiry and video brigade rendering.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Date.now=realNow});
