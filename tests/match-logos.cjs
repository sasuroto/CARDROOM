const fs=require('node:fs'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const env={},load=Module._load;Module._load=function(id,...args){return id==='cloudflare:workers'?{env}:load.call(this,id,...args)};
const {teamLogo,logoUrl}=require('../lib/team-logo.ts'),{withAppointment}=require('../lib/fixture-display.ts');
const home='https://a.espncdn.com/i/teamlogos/soccer/500/86.png',away='https://a.espncdn.com/i/teamlogos/soccer/500/83.png';
assert.equal(teamLogo({logo:home,logos:[{href:away}]}),home);
assert.equal(teamLogo({logos:[{href:home}]}),home);
assert.equal(teamLogo({logo:'',logos:[{}, {href:away}]}),away);
for(const bad of [null,'',{},'javascript:alert(1)','not-a-url'])assert.equal(logoUrl(bad),undefined);
assert.equal(teamLogo({logos:'invalid'}),undefined);
const input={id:'888900111',league:'primeira',homeLogo:home,homeScore:'2',checkedAt:'calendar',referee:'Official',appointmentType:'official appointment'};
const merged=withAppointment(input,{id:input.id,league:input.league,awayLogo:away,homeLogo:null});
assert.equal(merged.homeLogo,home);assert.equal(merged.awayLogo,away);assert.equal(merged.homeScore,'2');assert.equal(merged.checkedAt,'calendar');
assert.equal(withAppointment(input,{id:'999999',homeLogo:away}),input);
assert.equal(withAppointment(input,{league:'laliga',homeLogo:away}),input);
assert.equal(withAppointment(input,{homeLogo:'javascript:x'}).homeLogo,home);
const values=new Map(),bucket={get:async key=>values.has(key)?{json:async()=>structuredClone(values.get(key))}:null,put:async(key,text)=>values.set(key,JSON.parse(text))};env.BUCKET=bucket;
const Match=require('../app/api/match/route.ts');let offline=false,missing=false;
global.fetch=async url=>{
 if(offline)throw Error('offline fixture');
 return Response.json({header:{id:input.id,league:{slug:'por.1'},competitions:[{id:input.id,date:'2026-12-01T20:00Z',competitors:[{homeAway:'home',team:{displayName:'Home',...(missing?{}:{logos:[{href:home}]})}},{homeAway:'away',team:{displayName:'Away',...(missing?{}:{logo:away})}}]}]}});
};
const request=()=>Match.GET(new Request('https://site/api/match?id='+input.id+'&league=primeira'));
const expire=()=>{for(const [k,v] of values)if(k.startsWith('match/'))values.set(k,{...v,fetchedAt:'2000-01-01T00:00Z'})};
(async()=>{
 let result=await(await request()).json();assert.equal(result.homeLogo,home);assert.equal(result.awayLogo,away);
 missing=true;expire();result=await(await request()).json();assert.equal(result.homeLogo,home);assert.equal(result.awayLogo,away);
 offline=true;expire();result=await(await request()).json();assert.ok(result.error&&result.stale);assert.equal(result.homeLogo,home);assert.equal(result.awayLogo,away);
 values.clear();result=await(await request()).json();assert.ok(result.error);assert.equal(result.homeLogo,undefined);assert.equal(result.awayLogo,undefined);
 offline=false;result=await(await request()).json();assert.equal(result.homeLogo,undefined);assert.equal(result.awayLogo,undefined);
 // Exercise the real Crest component's missing and image-load error branches.
 const React=require('react'),Overview=require('../app/match-overview.tsx').default,realState=React.useState;let failed=false;
 React.useState=()=>[failed,v=>failed=v];
 const tree=Overview({match:{id:'test',home:'Home',away:'Away',homeLogo:home},leagueName:'Test'});
 function find(node){if(!node||typeof node!=='object')return null;if(typeof node.type==='function'&&node.type.name==='Crest')return node;for(const c of [node.props?.children].flat(Infinity)){const got=find(c);if(got)return got}return null}
 const crest=find(tree);assert.ok(crest);let rendered=crest.type(crest.props);assert.equal(rendered.props.children.type,'img');rendered.props.children.props.onError();rendered=crest.type(crest.props);assert.equal(rendered.props.children.type,'span');assert.equal(rendered.props.children.props['aria-label'],'Герб Home недоступен');
 failed=false;rendered=crest.type({...crest.props,src:undefined});assert.equal(rendered.props.children.type,'span');React.useState=realState;
 console.log('PASS logo extraction, identity guard, missing/invalid URLs, API no-logo/offline fallback, no invented assets, and image onError placeholder.');
})().catch(e=>{console.error(e);process.exitCode=1});
