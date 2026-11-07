// Synthetic identities only; no live storage, provider, or credential access.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const O=require('../lib/backup-drive.server.ts'),P=require('../lib/backup-drive-page.server.ts');
let checks=0,reads=0;const check=(v,label)=>{assert.ok(v,label);checks++};
global.fetch=()=>{throw Error('Unexpected provider call')};
const env={CARDROOM_BACKUP_OWNER_ID:'fixture-owner',CARDROOM_DRIVE_ENABLED:'true',CARDROOM_DRIVE_CLIENT_ID:'fixture.apps.googleusercontent.com',CARDROOM_DRIVE_CLIENT_SECRET:'fixture-secret-not-for-html',CARDROOM_DRIVE_TOKEN_KEY:Buffer.alloc(32,9).toString('base64url'),CARDROOM_DRIVE_ACCOUNT_EMAIL:'private@example.test',CARDROOM_DRIVE_OAUTH_MODE:'testing',DB:{prepare(q){check(q.startsWith('SELECT'),'read only SQL');reads++;const statement={first:async()=>null,bind:()=>statement};return statement}}};
const req=(id,path='/backup-drive')=>new Request(O.SITE_ORIGIN+path,{headers:id?{'oai-authenticated-user-id':id}:{}});
async function view(id,e=env,path){const r=await P.drivePage(req(id,path),e);return {r,html:await r.text()}}
(async()=>{
 let {r,html}=await view();check(r.status===401&&html.includes('/signin-with-chatgpt?return_to=%2Fbackup-drive'),'anonymous sign-in');check(!html.includes('<form')&&!reads,'anonymous cannot view connection');
 ({r,html}=await view('fixture-other'));check(r.status===403&&!reads&&!html.includes('<form'),'nonowner denied before storage');
 ({r,html}=await view('fixture-owner',{}));check(r.status===503&&html.includes('fixture-owner')&&html.includes('Автоматического назначения владельца нет'),'identity only bootstrap, no enrollment');check(!reads&&!html.includes('<form'),'bootstrap cannot connect');
 ({r,html}=await view('<script>alert("x")</script>',{}));check(!html.includes('<script>')&&html.includes('&lt;script&gt;'),'identity escaped');
 ({r,html}=await view('fixture-owner',{CARDROOM_BACKUP_OWNER_ID:'fixture-owner'}));check(r.status===503&&html.includes('disabled')&&!reads,'disabled configuration locks form');
 ({r,html}=await view('fixture-owner'));check(r.status===200&&html.includes('method="post"')&&html.includes('action="/api/backup-drive/start"')&&html.includes('target="_top"'),'owner native POST to existing handler');
 check(!html.includes(env.CARDROOM_DRIVE_CLIENT_SECRET)&&!html.includes(env.CARDROOM_DRIVE_ACCOUNT_EMAIL)&&!html.includes(env.CARDROOM_DRIVE_TOKEN_KEY)&&!html.includes('<input'),'no credentials exposed or collected');
 check(html.includes('Не включено')&&html.includes('Не проверены')&&html.includes('7 дней'),'honest backup and testing status');
 check(r.headers.get('Cache-Control')==='private, no-store'&&r.headers.get('Referrer-Policy')==='no-referrer','private no-cache no-referrer');
 check(r.headers.get('Content-Security-Policy').includes("default-src 'none'")&&r.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'")&&r.headers.get('Content-Security-Policy').includes('https://accounts.google.com'),'CSP supports fixed Google form redirect and prevents framing');
 check(r.headers.get('X-Robots-Tag')==='noindex, nofollow','no indexing');
 const cooldown={...env,DB:{prepare(q){const s={first:async()=>q.includes('retry_at')?{retry_at:Date.now()+3600000}:null,bind:()=>s};return s}}};
 ({r,html}=await view('fixture-owner',cooldown));check(html.includes('Пауза до')&&!html.includes('<form'),'cooldown hides action');
 const broken={...env,DB:{prepare(){throw Error('HIDDEN_SECRET')}}};
 ({r,html}=await view('fixture-owner',broken));check(r.status===503&&!html.includes('HIDDEN_SECRET')&&!html.includes('<form'),'storage failure no leakage or actions');
 ({r,html}=await view('fixture-owner',env,'/backup-drive?connection=failed&code=HIDDEN_CODE&state=HIDDEN_STATE'));check(html.includes('Последняя попытка')&&!html.includes('HIDDEN_'),'failed attempts explicit, no callback query echo');
 const realStatus=O.driveStatus;
 for(const status of ['credential-stored','reauthorization-required','unknown']){
  O.driveStatus=async()=>Response.json({status,persisted:true,connectedAt:'2026-11-06T10:00:00Z',reauthorizeBy:'2026-11-13T10:00:00Z',oauthMode:'testing'});
  ({r,html}=await view('fixture-owner'));
  check(status==='unknown'?r.status===503: r.status===200,'known/unknown status '+status);
  check(html.includes('<form')===(status==='reauthorization-required'),'only expired offers renewal '+status);
  if(status==='credential-stored')check(html.includes('Разрешение сохранено')&&html.includes('не подтверждение резервной копии'),'stored not backup');
 }
 O.driveStatus=async()=>Response.json({status:'credential-stored',persisted:false});
 ({r,html}=await view('fixture-owner'));check(r.status===503&&!html.includes('<form'),'unconfirmed stored state blocked');
 O.driveStatus=async()=>Response.json({status:'reauthorization-required',persisted:true,retryAt:new Date(Date.now()+3600000).toISOString()});
 ({r,html}=await view('fixture-owner'));check(!html.includes('<form')&&html.includes('Пауза до'),'expiry cannot bypass cooldown');
 O.driveStatus=realStatus;
 for(const status of [200,400,403,429,503]){const redirect=P.driveBrowserResult(Response.json({reason:'HIDDEN_PROVIDER_BODY'},{status}));check(redirect.status===303&&redirect.headers.get('Location')===O.SITE_ORIGIN+'/backup-drive?connection=failed','failure clean URL '+status);check(!(await redirect.text()).includes('HIDDEN'),'no provider error reflected');}
 const success=P.driveBrowserResult(new Response(null,{status:303,headers:{Location:'https://untrusted.test/?code=hidden'}}));check(success.headers.get('Location')===O.SITE_ORIGIN+'/backup-drive','success fixed destination, never arbitrary redirect');
 r=await P.drivePage(new Request('https://other.test/backup-drive'),env);check(r.status===403,'wrong origin denied');
 r=await P.drivePage(new Request(O.SITE_ORIGIN+'/backup-drive',{method:'POST'}),env);check(r.status===405,'page never accepts writes');
 const page=fs.readFileSync('lib/backup-drive-page.server.ts','utf8');check(!/console\.|setInterval|localStorage|sessionStorage|<script|fetch\(/.test(page),'no logging, script, storage, auto-poll or provider fetch');
 console.log(`Backup Drive page: ${checks} checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1});
