import {env} from 'cloudflare:workers';
import {LEAGUES} from '../../../lib/fixtures';
import {readCache} from '../../../lib/cache';
import {refereeUpdateKey} from '../../../lib/referee-updates';
import {refreshLeagueReferees} from '../../../lib/referee-hourly';
export const dynamic='force-dynamic';
const brief=({stats,matches,...report}:any)=>({...report,statsCheckedAt:stats?.checkedAt,refereeCount:stats?.rows?.length||0});
export async function GET(req:Request){
 const params=new URL(req.url).searchParams,league=params.get('league'),bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
 if([...params.keys()].some(key=>!['league','read'].includes(key))||(league&&!LEAGUES[league])||(params.has('read')&&params.get('read')!=='1'))return Response.json({error:'Некорректный запрос'},{status:400});
 if(!league||params.get('read')==='1'){
  const leagues=league?[league]:Object.keys(LEAGUES),updates=await Promise.all(leagues.map(async id=>{const saved=await readCache(bucket,refereeUpdateKey(id));return saved?{...brief(saved),persisted:true}:{league:id,status:'not-checked',persisted:false}}));
  return Response.json({intervalMinutes:60,timezone:'Asia/Tbilisi',scope:'Сегодня и следующие 6 дней; до 24 матчей турнира за проход, остальные переходят в начало следующей проверки.',leagues:Object.keys(LEAGUES),instructions:'Последовательно прочитайте /api/referees?league=<league> для каждого турнира из leagues. После каждого запроса прочитайте тот же адрес с &read=1: runId должен совпасть и persisted должен быть true. Сводки сайта обновляет /api/data; они сохраняют свой интервал 6 часов. Не повторяйте проверки раньше nextCheckAt, соблюдайте ограничения источника. Затем тем же порядком прочитайте /api/referee-journal?league=<league> (журнал сыгранных матчей арбитров с 1 июня 2026; ограниченная порция за проход) и проверьте /api/referee-journal?league=<league>&read=1: runId должен совпасть. Новые назначения автоматически доступны в календаре и панели матча, статистика — в /api/data. При ошибках сохраняются прежние подтверждённые значения с датами. Данные и секреты передавать не нужно; только чтение этих фиксированных адресов.',updates},{headers:{'Cache-Control':'no-store'}});
 }
 try{return Response.json(brief(await refreshLeagueReferees(league,bucket)),{headers:{'Cache-Control':'no-store'}})}catch(error){return Response.json({league,persisted:false,error:String(error)},{status:503,headers:{'Cache-Control':'no-store'}})}
}
