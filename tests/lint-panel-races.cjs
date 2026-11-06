// Deterministic panel lifecycle tests. No browser, real timers or network requests.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const React=require('react'),favorites=require('../app/favorites.tsx');
const hooks={useState:React.useState,useRef:React.useRef,useEffect:React.useEffect},originalFavorites=favorites.useFavorites;
const names=['window','document','navigator','localStorage','fetch','setTimeout','clearTimeout','setInterval','clearInterval'];
const descriptors=Object.fromEntries(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
const stored={'cardroom:selected-panel:expanded':'true'},timeouts=new Map(),intervals=new Map();let timerId=0,calls=0,checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++};
function target(extra={}){const listeners=new Map();return {...extra,listeners,addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),emit:(type,event={})=>{for(const fn of [...(listeners.get(type)||[])])fn(event)},count:()=>[...listeners.values()].reduce((n,s)=>n+s.size,0)}}
const windowMock=target(),documentMock=target({visibilityState:'visible'}),navigatorMock={onLine:true};
const set=(key,value)=>Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
set('window',windowMock);set('document',documentMock);set('navigator',navigatorMock);
set('localStorage',{getItem:k=>stored[k]??null,setItem:(k,v)=>stored[k]=String(v)});
set('setTimeout',(fn,ms)=>{const id=++timerId;timeouts.set(id,{fn,ms});return id});set('clearTimeout',id=>timeouts.delete(id));
set('setInterval',(fn,ms)=>{const id=++timerId;intervals.set(id,{fn,ms});return id});set('clearInterval',id=>intervals.delete(id));
const providerStamp=new Date(Date.now()).toISOString();
const pending=[];
set('fetch',url=>{calls++;return new Promise(resolve=>pending.push({url,resolve}))});
let chosen=[{kind:'match',id:'epl:888900111',league:'epl',label:'First — Match'}];
favorites.useFavorites=()=>({items:chosen,ready:true,storageError:false,toggle:()=>{}});
let cells=[],cursor=0,queue=[];
React.useState=initial=>{const i=cursor++;if(!cells[i])cells[i]={value:typeof initial==='function'?initial():initial};return [cells[i].value,v=>cells[i].value=typeof v==='function'?v(cells[i].value):v]};
React.useRef=initial=>{const i=cursor++;if(!cells[i])cells[i]={current:initial};return cells[i]};
React.useEffect=(fn,deps)=>{const i=cursor++,old=cells[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps?.[j]))){cells[i]={deps,cleanup:old?.cleanup};queue.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn()})}};
const Panel=require('../app/selected-matches.tsx').default;
const nodes=x=>x&&typeof x==='object'?[x,...React.Children.toArray(x.props?.children).flatMap(nodes)]:[];
const text=x=>typeof x==='string'||typeof x==='number'?String(x):x&&typeof x==='object'?React.Children.toArray(x.props?.children).map(text).join(' '):'';
function render(){cursor=0;const tree=Panel({data:{leagues:[]},onOpen:()=>{}});const pending=queue;queue=[];pending.forEach(fn=>fn());return tree}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
const cleanup=()=>{for(const cell of cells)cell?.cleanup?.();cells=[];queue=[]};
(async()=>{try{
 render();check(pending.length===1,'first selection starts one request');
 chosen=[{kind:'match',id:'epl:888900222',league:'epl',label:'Second — Match'}];render();
 check(pending.length===2,'new selection starts independently while old response remains pending');
 const result=(id,score)=>({ok:true,json:async()=>({id,league:'epl',home:'Home',away:'Away',state:'in',homeScore:score,awayScore:'0',fetchedAt:providerStamp})});
 // Model a transport whose response settles even after cancellation.
 pending[0].resolve(result('888900111','9'));await flush();
 windowMock.emit('focus');await flush();
 check(calls===2,'late old completion cannot clear the new generation in-flight lock');
 check(timeouts.size===0,'old generation cannot schedule a new timer');
 let tree=render();check(!text(tree).includes('9'),'removed match result never reappears');
 pending[1].resolve(result('888900222','2'));await flush();tree=render();
 check(nodes(tree).filter(n=>n.type==='article').length===1,'only current selection rendered');
 check(nodes(tree).filter(n=>n.type==='strong').map(text).join(',')==='2,0','current generation score wins');
 check(timeouts.size===1,'current generation schedules exactly one timer');
 chosen=[{...chosen[0],label:'Updated — Label'}];render();
 check(calls===3,'same identity label change updates the effect snapshot');
 cleanup();pending[2].resolve(result('888900222','3'));await flush();
 check(timeouts.size===0,'unmounted late response cannot restart polling');
 check(windowMock.count()===0&&documentMock.count()===0,'all generation listeners cleaned up');
 console.log(`PASS ${checks} selected-panel generation race assertions.`);
 }finally{cleanup();Object.assign(React,hooks);favorites.useFavorites=originalFavorites;for(const key of names){if(descriptors[key])Object.defineProperty(globalThis,key,descriptors[key]);else delete globalThis[key]}}})().catch(error=>{console.error(error);process.exitCode=1});
