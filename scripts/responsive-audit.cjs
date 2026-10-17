// Responsive audit: page overflow, content clipped by overflow:hidden, elements past the viewport that
// are not inside a scroll container, and open dialogs, for each route x width. Needs a running preview
// (npm run build && npm start) and playwright-core, which is not a project dependency; install it outside
// the pnpm-managed node_modules:
//   npm i --prefix /tmp/audit-tools playwright-core@1.56.1
//   PLAYWRIGHT_CORE=/tmp/audit-tools/node_modules/playwright-core node scripts/responsive-audit.cjs [out-prefix] [--shots]
// BASE_URL (default http://127.0.0.1:8787) and CHROME (Chromium path) can be overridden.
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');const fs=require('fs');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8787',CHROME=process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const out=process.argv[2]||'audit',shots=process.argv.includes('--shots');
const WIDTHS=[320,375,390,430,768,1440];
const ROUTES=['#dashboard','#league/epl/matches','#league/epl/standings','#league/epl/clubs','#league/epl/players','#league/epl/referees','#league/epl/appointed','#league/epl/overview','#league/epl/teams','#league/epl/corners','#league/epl/draws','#league/epl/calculator','#league/ucl/referees','#league/bundesliga/referees'];
(async()=>{
 const browser=await chromium.launch({executablePath:CHROME,args:['--no-sandbox']});
 const report=[];
 for(const w of WIDTHS){
  const ctx=await browser.newContext({viewport:{width:w,height:900},deviceScaleFactor:1,isMobile:w<768,hasTouch:w<768});
  const page=await ctx.newPage();
  for(const r of [...ROUTES,'match']){
   if(r==='match'){await page.goto(BASE+'/#league/epl/matches');await page.waitForTimeout(2500);const b=await page.$('.calendarMatch, [class*=calendarMatch] button, .calendarOpenArrow');if(!b){report.push({w,r,error:'no match button'});continue}await b.click().catch(()=>{});await page.waitForTimeout(3000)}
   else{await page.goto(BASE+'/'+r);await page.waitForTimeout(2500)}
   const res=await page.evaluate(()=>{
    const vw=document.documentElement.clientWidth,sw=document.documentElement.scrollWidth;
    // 'scroll' = inside an intentional scroll container (fine); 'clip' = cut by overflow:hidden (data hidden).
    const container=el=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(['auto','scroll'].includes(s.overflowX))return 'scroll';if(['hidden','clip'].includes(s.overflowX)){const pb=p.getBoundingClientRect(),b=el.getBoundingClientRect();if(b.right>pb.right+1||b.left<pb.left-1)return 'clip'}}return null};
    const scrollable=el=>container(el)==='scroll';
    const clipped=[];for(const el of document.querySelectorAll('body *')){const b=el.getBoundingClientRect();if(!b.width||!el.textContent.trim()||el.children.length)continue;if(container(el)==='clip'&&getComputedStyle(el).textOverflow!=='ellipsis')clipped.push((typeof el.className==='string'&&el.className?'.'+el.className.split(' ')[0]:el.tagName)+':'+el.textContent.trim().slice(0,25))}
    const scrollers=[...document.querySelectorAll('*')].filter(e=>['auto','scroll'].includes(getComputedStyle(e).overflowX)&&e.scrollWidth>e.clientWidth+1).length;
    const bad=[];for(const el of document.querySelectorAll('body *')){const b=el.getBoundingClientRect();if(b.width&&b.right>vw+1&&!scrollable(el)){const s=getComputedStyle(el);if(s.position==='fixed')continue;bad.push((el.className&&typeof el.className==='string'?'.'+el.className.split(' ').join('.'):el.tagName)+'['+Math.round(b.left)+'→'+Math.round(b.right)+']')}}
    // keep outermost offenders only
    return {vw,sw,bad:[...new Set(bad)].slice(0,12),clipped:[...new Set(clipped)].slice(0,8),scrollers,dialog:!!document.querySelector('dialog[open]')};
   });
   report.push({w,r,...res});
   if(shots&&(w<=430||w===1440))await page.screenshot({path:`${out}-${w}-${r.replace(/[#\/]/g,'_')}.png`,animations:'disabled',timeout:60000}).catch(e=>console.log('shot fail',w,r));
   if(r==='match')await page.keyboard.press('Escape');
  }
  await ctx.close();
 }
 await browser.close();
 fs.writeFileSync(out+'.json',JSON.stringify(report,null,1));
 const failed=report.filter(x=>x.error||x.sw>x.vw||x.bad?.length||x.clipped?.length);process.exitCode=failed.length?1:0;
 for(const x of report)console.log(x.w,x.r,x.error||((x.sw>x.vw?'OVERFLOW '+x.sw+'>'+x.vw:'ok')+(x.bad?.length?' | '+x.bad.slice(0,4).join(' '):'')+(x.clipped?.length?' | CLIPPED '+x.clipped.slice(0,5).join(' ; '):'')+(x.scrollers?' | scroll×'+x.scrollers:'')+(x.r==='match'?(x.dialog?' [dialog]':' [no dialog]'):'')));
})();
