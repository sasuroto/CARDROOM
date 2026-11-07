const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {parseSeasonalReferees:parse,normalizeRefereeSeason,confirmedRefereeSeason}=require('../lib/referee-season.ts');
const source='https://www.soccerbase.com/referees/home.sd',checkedAt='2026-11-01T14:00:00Z';
const table=(marker='2026/27')=>`<table><tr><th>Name</th><th></th><th>GAMES ${marker}</th><th>YELLOW CARDS</th><th>RED</th></tr><tr><td>John Smith</td><td>-</td><td>12</td><td>48</td><td>1</td></tr></table>`;
const group={...parse('<select><option>2025/26</option></select>'+table(),'epl',source,checkedAt),source,checkedAt};
assert.equal(confirmedRefereeSeason(group),true);assert.equal(group.rows[0].yellowN,12);
for(const html of ['<h1>2026/27</h1>'+table('2025/26'),'<h1>2026/27</h1>'+table(''),table()+'<table><tr><td>Unrelated 2025/26</td></tr></table>'+table('2025/26'),table().replace('<table>','<table><caption>2025/26</caption>')])assert.throws(()=>parse(html,'epl',source,checkedAt),/таблиц/i);
assert.throws(()=>parse(table().replace('<th>GAMES 2026/27</th>','<th>GAMES</th>')+'<script>2026/27</script>','epl',source,checkedAt),/Сезон/);
for(const change of [{seasonEvidence:undefined},{source:'https://wrong.example'},{checkedAt:'2026-10-01T00:00Z'}]){const normalized=normalizeRefereeSeason({...group,...change});assert.equal(normalized.seasonConfirmed,false);assert.deepEqual(normalized.rows,group.rows);}
console.log('PASS table-bound season: current header, old navigation ignored, wrong table season, missing marker, multiple tables, mixed caption, scripts, legacy and mismatched provenance');
