const fs=require('node:fs'),assert=require('node:assert/strict'),Module=require('module'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const React=require('react'),original={useState:React.useState,useEffect:React.useEffect,useRef:React.useRef};
let values=[],i=0;React.useState=x=>{const id=i++;if(!(id in values))values[id]=typeof x==='function'?x():x;return[values[id],n=>values[id]=typeof n==='function'?n(values[id]):n]};React.useEffect=()=>{};React.useRef=v=>({current:v});
const {RefereeDialog}=require('../app/match-center.tsx');
const nodes=x=>!x||typeof x!=='object'?[]:[x,...React.Children.toArray(x.props?.children).flatMap(nodes)];
let closed=0,item={match:{id:'888111222',league:'epl',home:'Home',away:'Away',date:'2026-11-02T18:00:00Z',state:'pre'},loading:false};const data={leagues:[{id:'epl',name:'Premier League'}]};
const draw=()=>{i=0;return nodes(RefereeDialog({item,data,onClose:()=>closed++}))};
let tree=draw();assert.equal(tree.filter(x=>x.props.role==='tab').length,6);assert.equal(tree.find(x=>x.props.role==='tabpanel').props['aria-labelledby'],'match-tab-overview');
const choose=tab=>{tree.find(x=>x.props.id==='match-tab-'+tab).props.onClick();tree=draw()};
for(const view of ['lineups','events','sources']){choose(view);assert.equal(tree.find(x=>x.props.view===view).props.match.id,item.match.id);assert.equal(tree.find(x=>x.props.role==='tabpanel').props['aria-labelledby'],'match-tab-'+view);assert.equal(tree.filter(x=>x.props.role==='tab'&&x.props.tabIndex===0).length,1)}
choose('analysis');assert.ok(tree.some(x=>x.props.showOverview===false));
let focused=-1,prevented=false;const nav=tree.find(x=>x.props.role==='tablist');nav.props.onKeyDown({key:'Home',preventDefault:()=>prevented=true,currentTarget:{querySelectorAll:()=>Array.from({length:6},(_,n)=>({focus:()=>focused=n}))}});tree=draw();assert.ok(prevented);assert.equal(focused,0);assert.equal(tree.find(x=>x.props.role==='tab'&&x.props['aria-selected']).props.id,'match-tab-overview');
choose('events');item={...item,match:{...item.match,id:'888111223'}};tree=draw();assert.equal(tree.find(x=>x.props.role==='tab'&&x.props['aria-selected']).props.id,'match-tab-overview');
tree.find(x=>x.type==='dialog').props.onCancel();assert.equal(closed,1);
item={profile:{name:'A referee',stats:[]}};tree=draw();assert.ok(!tree.some(x=>x.props.role==='tablist'));assert.ok(tree.some(x=>x.props.className==='refArchive'));
Object.assign(React,original);console.log('PASS match-centre tabs: six sections, evidence routing, keyboard roving focus, new-match reset, close, standalone referee preserved.');
