import {env} from 'cloudflare:workers';
import {readCache} from '../../../lib/cache';
import {AUTHORITIES,FALLBACK_SOURCE} from '../../../lib/referee-authority';
export const dynamic='force-dynamic';

// Read-only health summary built from state the app already stores (backoff
// windows and the last official report). It makes no upstream requests.
const HOSTS:Record<string,string>={epl:'www.premierleague.com',ucl:'www.uefa.com'};
export async function GET(){
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET,now=Date.now();
 const espnBackoff=await readCache(bucket,'referee-updates/source-backoff/site.api.espn.com.json');
 const pl=await readCache(bucket,'official-appointments/pl/4731949/v1.json'),uefa=await readCache(bucket,'official-appointments/uefa/2026-27/v1.json');
 const sources=await Promise.all(Object.values(AUTHORITIES).map(async a=>{
  const host=HOSTS[a.league],backoff=host?await readCache(bucket,`referee-updates/source-backoff/${host}.json`):null;
  const report=a.league==='epl'?pl:a.league==='ucl'?uefa:null;
  const status=backoff?.until>now?'limited':report?(report.stale?'degraded':'ok'):a.integration==='manual-verified'?'manual':'unknown';
  return {league:a.league,authority:a.authority,integration:a.integration,status,lastSuccessAt:report?.checkedAt||null,lastAttemptAt:report?.lastAttemptAt||null,retryAt:backoff?.until>now?new Date(backoff.until).toISOString():null,error:report?.stale?report.error||'Повторная проверка не удалась':null};
 }));
 const espn={authority:FALLBACK_SOURCE.authority,role:'fallback',status:espnBackoff?.until>now?'limited':'ok',retryAt:espnBackoff?.until>now?new Date(espnBackoff.until).toISOString():null};
 return Response.json({checkedAt:new Date(now).toISOString(),storage:!!bucket,sources,fallback:espn},{headers:{'Cache-Control':'no-store'}});
}
