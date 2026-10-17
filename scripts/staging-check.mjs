// Real-time QA of a deployed staging Worker. Nothing is simulated: every cycle waits the real interval.
//   node scripts/staging-check.mjs <base-url> [--cycles 5] [--interval 11] [--out report.md] [--observe]
// --interval: minutes between cycles (≥ 5, the server-side gap). --observe: only read; the staging cron
// drives collection. Without it each cycle also calls /api/referee-journal?next=1 once.
import {execFileSync} from 'node:child_process';
import {existsSync,writeFileSync} from 'node:fs';

const args=process.argv.slice(2),base=(args.find(a=>/^https?:\/\//.test(a))||'').replace(/\/$/,'');
const opt=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:fallback};
const cycles=Number(opt('cycles',5)),interval=Number(opt('interval',11)),out=opt('out','staging-report.md'),observe=args.includes('--observe');
if(!base)throw Error('Укажите адрес staging, например https://cardroom-referees-staging.<account>.workers.dev');
if(/chatgpt\.site|cardroom-europe/.test(base))throw Error('Отказ: это адрес production.');
if(!(cycles>=1&&cycles<=10)||!(interval>=0))throw Error('Некорректные --cycles/--interval');
const LEAGUES=['epl','ucl','laliga','segunda','seriea','bundesliga','ligue1','superlig','primeira'];
const lines=[],failures=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=s=>{console.log(s);lines.push(s)};
const fail=s=>{failures.push(s);log('❌ '+s)};
async function get(path){const r=await fetch(base+path,{signal:AbortSignal.timeout(90000)});let body=null;try{body=await r.json()}catch{}return {status:r.status,body}}

log(`# CARDROOM Referee Intelligence — staging QA\n\nАдрес: ${base}\nНачало: ${new Date().toISOString()}\nЦиклов: ${cycles}, интервал: ${interval} мин, режим: ${observe?'наблюдение (cron)':'next=1 + cron'}\n`);

// 1. API smoke and validation.
log('## 1. API');
const home=await fetch(base+'/',{signal:AbortSignal.timeout(60000)});log(`- GET / → ${home.status}`);if(home.status!==200)fail('Главная страница не 200');
const status=await get('/api/referee-journal');log(`- GET /api/referee-journal → ${status.status}, лиг: ${status.body?.leagues?.length}`);if(status.status!==200||status.body?.leagues?.length!==9)fail('Статус журнала: не 9 лиг');
for(const q of ['league=bad','next=2','referee=ab','league=epl&url=https://x']){const r=await get('/api/referee-journal?'+q);log(`- ?${q} → ${r.status}`);if(r.status!==400)fail(`?${q}: ожидался 400`)}

// 2. Cycles with real waiting.
log('\n## 2. Циклы обновления');
const history={};
for(let c=1;c<=cycles;c++){
 if(c>1){log(`\n…ожидание ${interval} мин`);await sleep(interval*60000)}
 let step='—';if(!observe){const r=await get('/api/referee-journal?next=1');step=`${r.status} ${r.body?.status||r.body?.error||''}${r.body?.league?' '+r.body.league:''}`;if(r.status>=500)fail(`Цикл ${c}: next=1 → ${r.status} ${r.body?.error||''}`)}
 log(`\n### Цикл ${c} · ${new Date().toISOString()} · next=1: ${step}\n`);
 log('| Лига | Сыграно (ESPN) | Собрано | Покрытие | Без арбитра | Записей / уникальных | Арбитров | Ошибок прохода | Обновлено |');
 log('|---|---|---|---|---|---|---|---|---|');
 for(const league of LEAGUES){
  const r=await get(`/api/referee-journal?league=${league}&read=1`),d=r.body||{};
  if(r.status!==200){fail(`${league}: read=1 → ${r.status}`);continue}
  const cov=d.coverage||{},pct=cov.finished?Math.round(100*cov.collected/cov.finished)+'%':'—';
  log(`| ${league} | ${cov.finished??'—'} | ${cov.collected??'—'} | ${pct} | ${cov.withoutReferee??'—'} | ${d.integrity?`${d.integrity.records} / ${d.integrity.uniqueIds}`:'—'} | ${d.referees?.length??'—'} | ${d.errors?.length??'—'} | ${d.completedAt||'не собиралось'} |`);
  if(d.integrity&&d.integrity.records!==d.integrity.uniqueIds)fail(`${league}: дубликаты (${d.integrity.records} записей, ${d.integrity.uniqueIds} уникальных)`);
  const prev=history[league];
  if(prev&&d.integrity&&d.integrity.records<prev.records)fail(`${league}: записей стало меньше (${prev.records} → ${d.integrity.records})`);
  if(prev&&cov.finished<prev.finished)fail(`${league}: найденных матчей стало меньше`);
  history[league]={records:d.integrity?.records||0,finished:cov.finished||0,errors:d.errors||[],coverage:cov,complete:d.complete,referees:d.referees||[]};
 }
}

// 3. Errors reported by the last pass of each league.
log('\n## 3. Ошибки последнего прохода');
for(const league of LEAGUES){const e=history[league]?.errors||[];log(`- ${league}: ${!history[league]?.coverage?.finished&&!history[league]?.records&&!e.length&&!history[league]?.coverage?'не собиралось':e.length?e.slice(0,5).join(' · ')+(e.length>5?` … ещё ${e.length-5}`:''):'нет'}`)}

// 4. Referee cards rendered by the real page (headless Chromium executes the client code).
log('\n## 4. Карточки арбитров в интерфейсе');
const chrome=[process.env.CHROME,'/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(p=>p&&existsSync(p));
if(!chrome)log('- Chromium не найден — проверка пропущена.');
else for(const league of LEAGUES){
 try{
  const dom=execFileSync(chrome,['--headless','--no-sandbox','--disable-gpu','--virtual-time-budget=20000','--dump-dom',`${base}/#league/${league}/referees`],{encoding:'utf8',timeout:90000,stdio:['ignore','pipe','ignore']});
  const cards=(dom.match(/class="riCard"/g)||[]).length,missing=dom.includes('журнал этого турнира ещё не собран'),broken=/NaN|Infinity|Invalid Date/.test(dom);
  log(`- ${league}: карточек ${cards}${missing?' · «Нет данных: журнал не собран»':''}${broken?' · ❌ некорректные значения':''}`);
  if(broken)fail(`${league}: в интерфейсе NaN/Infinity/Invalid Date`);
  if(!cards&&!missing&&(history[league]?.referees.length||0)>0)fail(`${league}: API отдаёт арбитров, а карточки не отрисованы`);
 }catch(error){fail(`${league}: рендер страницы — ${String(error).slice(0,120)}`)}
}

// 5. Sample for manual verification against primary sources (not automated).
log('\n## 5. Выборка для сверки с первичными источниками (вручную)');
for(const league of LEAGUES){
 const ref=history[league]?.referees?.[0];if(!ref){log(`- ${league}: нет данных`);continue}
 const r=await get('/api/referee-journal?referee='+encodeURIComponent(ref.name)),records=(r.body?.leagues||[]).find(l=>l.league===league)?.records||[];
 for(const m of records.slice(0,3))log(`- ${league} · ${m.date.slice(0,10)} · ${m.home} — ${m.away} · арбитр ${m.referee} · ЖК ${m.yellow.total??'нет данных'} · КК ${m.red.total??'нет данных'} · ${m.source}`);
}

log(`\n## Итог\n\nОшибок: ${failures.length}${failures.length?'\n'+failures.map(f=>'- '+f).join('\n'):''}\nКонец: ${new Date().toISOString()}`);
writeFileSync(out,lines.join('\n')+'\n');
process.exitCode=failures.length?1:0;
