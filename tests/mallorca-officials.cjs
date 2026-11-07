// Actual RFEF appointment PDF, retrieved 2026-11-02 20:09 UTC.
// Source and hash are pinned alongside the fixture; no network used by this test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {parseRFEFPdf}=require('../lib/advance-rfef.ts');
const {advanceTeam,applyAdvanceOfficials}=require('../lib/advance-officials.ts');
(async()=>{
 const meta=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/rfef-segunda-20261102.json'),'utf8'));
 const bytes=fs.readFileSync(path.join(__dirname,'fixtures/rfef-segunda-20261102.pdf'));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),meta.sha256);
 const rows=await parseRFEFPdf(new Uint8Array(bytes),'segunda',meta.source);
 const row=rows.find(r=>r.home==='RCD Mallorca'&&r.away==='Cádiz CF');
 assert.ok(row);assert.equal(row.day,'2026-11-02');assert.equal(row.referee,'Gonzalo Romero');
 assert.equal(row.var,'Carlos Del Cerro');assert.equal(row.avar,'José Luis Guzmán');assert.equal(row.fourthOfficial,'Carlos Castell');assert.deepEqual(row.assistants,['Josep Antoni Vigo','Álvaro Sanz']);
 assert.equal(advanceTeam(row.home,'segunda'),advanceTeam('Mallorca','segunda'));
 assert.equal(advanceTeam(row.away,'segunda'),advanceTeam('Cádiz','segunda'));
 const report={rows:rows.map(r=>({...r,checkedAt:meta.checkedAt})),lastAttemptAt:meta.checkedAt};
 const match={id:'401883147',league:'segunda',home:'Mallorca',away:'Cádiz',date:'2026-11-03T00:00:00+04:00',state:'in',homeScore:'0',awayScore:'0',statusCheckedAt:meta.checkedAt};
 const applied=applyAdvanceOfficials(match,report);
 assert.equal(applied.referee,row.referee);assert.equal(applied.appointmentSource,meta.source);assert.equal(applied.currentVerified,true);
 assert.equal(applied.homeScore,'0');assert.equal(applied.awayScore,'0');assert.equal(applied.state,'in');assert.equal(applied.statusCheckedAt,meta.checkedAt);
 for(const change of [{date:'2026-11-04T00:00:00+04:00'},{league:'laliga'},{home:'Mallorca B'},{away:'Cádiz B'},{home:'Cádiz',away:'Mallorca'}])assert.equal(applyAdvanceOfficials({...match,...change},report).referee,undefined,JSON.stringify(change));
 assert.equal(applyAdvanceOfficials(match,{...report,stale:true}).appointmentStale,true);
 const conflict={...row,referee:'Different official',source:'https://rfef.es/another-publication.pdf',checkedAt:meta.checkedAt};
 assert.equal(applyAdvanceOfficials(match,{...report,rows:[...report.rows,conflict]}).referee,undefined);
 const neighbors=[
  {id:'401883146',home:'Real Oviedo',away:'Las Palmas',date:'2026-11-02T15:15Z',referee:'Alejandro Morilla',var:'Guillermo Cuadra',avar:'José Luis Guzmán',fourthOfficial:'Gaizka Altuna',assistants:['Alaiz Gutiérrez','David Monge']},
  {id:'401883123',home:'Real Valladolid',away:'Leganés',date:'2026-11-02T17:30Z',referee:'Dámaso Arcediano',var:'Juan Luis Pulido',avar:'Daniel Palencia',fourthOfficial:'Álvaro Rodríguez',assistants:['Christian Valverde','Samuel Sanz']}
 ];
 for(const observed of neighbors){
  const {referee,var:video,avar,fourthOfficial,assistants,...identity}=observed;
  const fixture={...identity,league:'segunda'},actual=applyAdvanceOfficials(fixture,report);
  assert.equal(actual.referee,referee);assert.equal(actual.var,video);assert.equal(actual.avar,avar);assert.equal(actual.fourthOfficial,fourthOfficial);assert.deepEqual(actual.assistants,assistants);assert.equal(actual.currentVerified,true);assert.equal(actual.appointmentSource,meta.source);
  for(const change of [{league:'laliga'},{date:'2026-11-03T17:30Z'},{home:identity.home+' B'},{away:identity.away+' B'},{home:identity.away,away:identity.home}])assert.equal(applyAdvanceOfficials({...fixture,...change},report).referee,undefined,JSON.stringify(change));
 }
 console.log('PASS actual RFEF Mallorca–Cádiz and neighboring Segunda fixtures parser, explicit aliases, crew, date/league/team identity and stale/conflict safeguards.');
})().catch(e=>{console.error(e);process.exitCode=1});
