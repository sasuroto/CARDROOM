/* eslint-disable @typescript-eslint/no-require-imports -- Standalone offline regression harness. */
// Actual React SSR plus bounded CSS rule contracts, not a browser/layout engine.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
require.extensions['.css']=()=>{};
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const Home=require('../app/page.tsx').default,Results=require('../app/results/page.tsx').default,{FavoritesProvider}=require('../app/favorites.tsx');
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++};
const favorites=require('../app/favorites.tsx'),originalFavorites=favorites.useFavorites;
favorites.useFavorites=()=>({items:[{kind:'match',id:'epl:999999',league:'epl',label:'Synthetic Home — Synthetic Away'}],ready:true,storageError:false,has:()=>false,toggle:()=>{}});
const originalFetch=global.fetch;let requests=0;
global.fetch=()=>{requests++;throw Error('Unexpected network in offline SSR')};
try{
 const home=render(React.createElement(FavoritesProvider,null,React.createElement(Home)));
 const header=home.match(/<header[^>]*>[\s\S]*?<\/header>/)?.[0];
 check(!!header,'actual Home renders its site header');
 check((header.match(/href="\/results"/g)||[]).length===1,'one native results link, not duplicate desktop/mobile navigation');
 const anchor=header.match(/<a href="\/results"[^>]*>[\s\S]*?<\/a>/)?.[0];
 check(anchor?.includes('Результаты ↗'),'results has a visible descriptive accessible name');
 check(!/tabindex|aria-hidden|hidden=|role=|target=/.test(anchor),'native keyboard link has no focus/visibility overrides or new window');
 check(header.includes('href="/"')&&header.includes('CARDROOM'),'brand retains native home navigation');
 for(const label of ['Поиск по сайту','Открыть избранное'])check(header.includes('aria-label="'+label+'"'),label+' retained');
 check(header.includes('dotLaunch'),'actual DOT launcher retained');
 check(home.indexOf('selectedMatches')>home.indexOf('</header>'),'My Matches stays after header');
 check(home.indexOf('dailyBar')>home.indexOf('selectedMatches'),'Today strip stays after My Matches');
 const results=render(React.createElement(Results));
 check(results.includes('class="resultsPage"')&&results.includes('← К турнирам'),'actual /results page and return navigation render');
 check(results.includes('href="/"'),'results return destination remains home');
 check(requests===0,'SSR does not execute effects or fetch backend/providers');
}finally{global.fetch=originalFetch;favorites.useFavorites=originalFavorites}
const product=fs.readFileSync(path.join(__dirname,'../app/product-upgrade.css'),'utf8'),theme=fs.readFileSync(path.join(__dirname,'../app/reading-theme.css'),'utf8'),globals=fs.readFileSync(path.join(__dirname,'../app/globals.css'),'utf8');
// Extract full top-level media bodies without truncating nested rules.
function media(css){const blocks=[];const re=/@media\s*\((max|min)-width:\s*(\d+)px\)\s*\{/g;let match;while((match=re.exec(css))){let depth=1,end=re.lastIndex;for(;depth&&end<css.length;end++){if(css[end]==='{')depth++;if(css[end]==='}')depth--}blocks.push({kind:match[1],width:Number(match[2]),body:css.slice(re.lastIndex,end-1)});re.lastIndex=end}return blocks}
const mobile=media(product).find(x=>x.kind==='max'&&x.width===650);
check(!!mobile,'fix is bounded to the existing 650px mobile breakpoint');
check(mobile.body.includes('.shell>header .headerRight{display:flex;flex-basis:100%}'),'existing link container is visible and gets a full flex line');
check(mobile.body.includes('.shell>header .resultsNav{display:inline-flex;align-items:center;min-height:44px}'),'results has a 44px-high native link hit target');
check(!/\.headerRight\s*\{[^}]*display:\s*none/.test(product),'old mobile hiding rule cannot win with important');
const themeMobile=media(theme).find(x=>x.kind==='max'&&x.width===650&&x.body.includes('.shell > header'));
check(/\.shell > header\s*\{[^}]*height: auto;[^}]*flex-wrap: wrap;/.test(themeMobile.body),'header grows and wraps in normal flow, no overlap positioning');
check(/a:focus-visible\s*\{[^}]*outline:2px solid var\(--focus\);outline-offset:4px/.test(globals),'native anchor retains visible focus treatment');
check(theme.includes('header .resultsNav { color: var(--highlight);'),'existing contrast/color design retained');
for(const width of [320,360,390,650,651,800,1166]){
 const active=media(product).filter(x=>x.kind==='max'?width<=x.width:width>=x.width).map(x=>x.body).join('\n');
 check(active.includes('.shell>header .headerRight{display:flex;flex-basis:100%}')===(width<=650),`mobile navigation rule applicability at ${width}px`);
 check(active.includes('.shell>header .resultsNav{display:inline-flex;align-items:center;min-height:44px}')===(width<=650),`mobile target-size rule applicability at ${width}px`);
}
console.log(`PASS ${checks} mobile results navigation checks (actual SSR + CSS contracts; no browser geometry claim)`);
