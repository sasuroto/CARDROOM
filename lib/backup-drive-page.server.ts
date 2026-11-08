import {driveStatus, SITE_ORIGIN, type DriveEnv} from './backup-drive.server';

// Server-rendered, no scripts, no credential inputs, no storage/provider writes.
// The identity-only setup screen does NOT enroll a visitor as the owner.
const pageHeaders = {
 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'private, no-store',
 'Vary':'Cookie', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY', 'X-Robots-Tag':'noindex, nofollow',
 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'",
};
const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Browser navigation always ends at a clean same-origin URL. Never carry OAuth
// code/state/provider text into a result URL, HTML, or error message.
export function driveBrowserResult(response:Response){
 const success=response.status===303;
 return new Response(null,{status:303,headers:{...pageHeaders,
  Location:SITE_ORIGIN+'/backup-drive'+(success?'':'?connection=failed'),
 }});
}
// Native form POST needs its same-origin Origin header. no-referrer serializes
// it as "null" in browsers; keep no-referrer on callback/result redirects above.
const shell = (body:string,status=200) => new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google Drive · CARDROOM</title><style>
*{box-sizing:border-box}body{margin:0;background:#171b21;color:#eeeae2;font:16px/1.6 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:48px 24px 70px}a{color:#c5d0ff;text-underline-offset:4px}nav{display:flex;justify-content:space-between;gap:18px;margin-bottom:58px;font-size:13px}nav strong{letter-spacing:.16em}h1{font-size:clamp(30px,5vw,44px);line-height:1.15;letter-spacing:-.04em;margin:10px 0 22px}h2{font-size:20px;line-height:1.3;margin:0 0 14px}p{margin:0 0 18px}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.16em;color:#aeb7c7}.muted{color:#b5bdca}.card{background:#242a33;border:1px solid #3c4451;border-radius:18px;padding:26px;margin:24px 0}.notice{border-left:3px solid #c7a872;padding-left:18px;margin:28px 0}.button,button{display:inline-block;padding:13px 20px;background:#c5d0ff;color:#18203b;border:0;border-radius:10px;font:600 16px/1.4 system-ui;cursor:pointer;text-decoration:none}button:disabled{opacity:.45;cursor:not-allowed}a:focus-visible,button:focus-visible{outline:3px solid #e5c685;outline-offset:5px}code{display:block;overflow-wrap:anywhere;user-select:all;padding:14px;background:#171b21;border-radius:8px;font-size:13px}dl{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}dt{color:#b5bdca}dd{margin:0;overflow-wrap:anywhere}form{margin:24px 0}footer{margin-top:38px;font-size:13px;color:#b5bdca}@media(max-width:480px){main{padding:25px 18px 45px}nav{margin-bottom:36px}.card{padding:20px}dl{grid-template-columns:1fr;gap:5px}dd{margin-bottom:12px}.button,button{width:100%;text-align:center}}
</style></head><body><main><nav><strong>CARDROOM</strong><a href="/" target="_top">Вернуться к матчам</a></nav><p class="eyebrow">Настройки владельца</p><h1>Google Drive</h1>${body}<footer>Эта страница не обновляет матчи и не меняет расписание CARDROOM.</footer></main></body></html>`, {status,headers:{...pageHeaders,'Referrer-Policy':'same-origin'}});

function date(value:unknown){
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return 'Не подтверждено';
 return escape(new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tbilisi'}).format(new Date(value)))+' · Тбилиси';
}

export async function drivePage(req:Request,env:DriveEnv):Promise<Response>{
 if(req.method!=='GET')return new Response(null,{status:405,headers:{...pageHeaders,Allow:'GET'}});
 if(new URL(req.url).origin!==SITE_ORIGIN)return shell('<p>Недопустимый адрес запроса.</p>',403);
 const id=req.headers.get('oai-authenticated-user-id');
 if(!id)return shell('<section class="card"><h2>Войдите через ChatGPT</h2><p>Настройки подключения доступны только владельцу. Вход не предоставляет доступ к Google Drive.</p><a class="button" target="_top" href="/signin-with-chatgpt?return_to=%2Fbackup-drive">Войти через ChatGPT</a></section>',401);
 if(id.length>256)return shell('<p>Не удалось подтвердить пользователя.</p>',403);
 if(!env.CARDROOM_BACKUP_OWNER_ID)return shell(`<section class="card"><h2>Владелец ещё не настроен</h2><p>Ни один пользователь пока не может подключить Google Drive. Идентификатор ниже относится только к вашей текущей сессии ChatGPT на этом сайте — это не секрет и не подтверждение прав владельца.</p><p class="muted">Ваш идентификатор для настройки:</p><code>${escape(id)}</code><p class="muted" style="margin-top:18px">Владелец должен быть отдельно подтверждён в настройках сервера. Автоматического назначения владельца нет.</p></section><p class="notice">Не вводите и не отправляйте Client secret в чат. Резервирование в Google Drive не подключено.</p>`,503);
 if(id!==env.CARDROOM_BACKUP_OWNER_ID)return shell('<section class="card"><h2>Нет доступа</h2><p>Вы вошли в ChatGPT, но настройки подключения доступны только владельцу CARDROOM.</p></section>',403);
 // Status authenticates again, decrypts stored state and never contacts Google.
 const response=await driveStatus(new Request(SITE_ORIGIN+'/api/backup-drive/status',{headers:{'oai-authenticated-user-id':id}}),env);
 const s=await response.json() as Record<string,unknown>;
 if(!response.ok){
  const disabled=s.reason==='disabled'||s.reason==='unconfigured';
  return shell(`<section class="card"><h2>${disabled?'Серверное подключение ещё не настроено':'Состояние подключения не подтверждено'}</h2><p>${disabled?'Нужно безопасно настроить OAuth-клиент и шифрование на сервере. Секреты нельзя вводить на этой странице или отправлять в чат.':'Не удалось безопасно прочитать конфигурацию или сохранённое подключение. Повторное подключение заблокировано до проверки.'}</p><button disabled>Подключить Google Drive</button></section><p class="notice">Резервирование в Google Drive не подтверждено.</p>`,response.status);
 }
 if(!['not-connected','credential-stored','reauthorization-required'].includes(String(s.status))||
  s.persisted!==(s.status!=='not-connected'))return shell('<section class="card"><h2>Состояние подключения не подтверждено</h2><p>Получен несогласованный отчёт. Подключение заблокировано до проверки.</p></section>',503);
 const stored=s.status==='credential-stored'&&s.persisted===true;
 const expired=s.status==='reauthorization-required';
 const cooldown=typeof s.retryAt==='string'&&Date.parse(s.retryAt)>Date.now();
 const ready=s.status==='not-connected'||expired;
 const form=ready&&!cooldown?'<form method="post" action="/api/backup-drive/start" target="_top"><button type="submit">'+(expired?'Повторно разрешить доступ':'Подключить Google Drive')+'</button></form>':'';
 const failed=new URL(req.url).searchParams.get('connection')==='failed';
 return shell(`${failed?'<p class="notice">Последняя попытка подключения не подтверждена. Ниже показано только сохранённое состояние; прежнее разрешение не означает успех этой попытки.</p>':''}<section class="card"><h2>${stored?'Разрешение сохранено':expired?'Нужно повторное разрешение':'Google Drive не подключён'}</h2><p>${stored?'Зашифрованные данные подключения сохранены и повторно прочитаны. Это не проверка текущего доступа к Google и не подтверждение резервной копии.':expired?'Срок сохранённого разрешения истёк. Это не означает потерю данных CARDROOM.':'После нажатия откроется Google. Запрашивается только доступ к файлам, созданным или явно выбранным для этого приложения (drive.file), не ко всему Диску.'}</p><dl><dt>Разрешение сохранено</dt><dd>${date(s.connectedAt)}</dd><dt>Повторный вход до</dt><dd>${date(s.reauthorizeBy)}</dd><dt>Резервирование в Drive</dt><dd>Не включено</dd><dt>Внешняя копия и восстановление</dt><dd>Не проверены</dd></dl>${cooldown?`<p class="notice">Пауза до ${date(s.retryAt)}. Не повторяйте подключение раньше этого времени.</p>`:''}${form}${s.oauthMode==='testing'?'<p class="muted">Google-приложение находится в режиме Testing: разрешение ограничено сроком до 7 дней. Постоянная фоновая работа пока не подтверждена.</p>':''}</section><p class="notice">Подключение аккаунта — только первый этап. Доступ к папке, загрузка зашифрованной копии и проверка восстановления ещё предстоят.</p><a href="/backup-drive" target="_top">Проверить сохранённое состояние</a>`);
}
