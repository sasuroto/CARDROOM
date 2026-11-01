const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const React=require('react'),Overview=require('../app/match-overview.tsx').default,{FavoriteButton}=require('../app/favorites.tsx');
function nodes(n){return n&&typeof n==='object'?[n,...React.Children.toArray(n.props?.children).flatMap(nodes)]:[]}
const sample={id:'888111222',league:'epl',home:'Example Home',away:'Example Away',state:'pre',statusName:'STATUS_POSTPONED',clock:"0'",homeScore:'0',awayScore:'0'};
let elements=nodes(Overview({match:sample}));let button=elements.find(n=>n.type===FavoriteButton);assert.equal(button.props.id,'epl:888111222');assert.equal(button.props.label,'Example Home — Example Away');
let status=elements.find(n=>n.props?.className==='overviewStatus');assert.equal(React.Children.toArray(status.props.children).join(''),'Перенесён');
assert.equal(elements.some(n=>n.props?.className==='overviewScore'&&React.Children.toArray(n.props.children).includes('0')),false);
elements=nodes(Overview({match:{...sample,state:'in',statusName:'STATUS_HALFTIME',clock:"45'"}}));status=elements.find(n=>n.props?.className==='overviewStatus');assert.ok(React.Children.toArray(status.props.children).join('').startsWith('Перерыв'));
assert.ok(!nodes(Overview({match:{home:'Home',away:'Away'}})).some(n=>n.type===FavoriteButton));
assert.ok(fs.readFileSync('app/match-overview.tsx','utf8').includes('appointmentConflict'));
assert.ok(fs.readFileSync('app/page.tsx','utf8').includes('SelectedMatches'));
console.log('PASS detail favorites, provider statuses, identity prerequisites and retained v72 panel/evidence.');

const panel=fs.readFileSync('app/selected-matches.tsx','utf8');assert.ok(panel.includes('Последняя попытка'));assert.ok(panel.includes('Нет соединения'));assert.ok(panel.includes("event.key==='Escape'"));
