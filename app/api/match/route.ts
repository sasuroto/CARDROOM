import {applyCurrentAppointment} from '../../../lib/current-context';
import {venueFields} from '../../../lib/match-location';
import {espnOfficials} from '../../../lib/match-officials';
import {env} from 'cloudflare:workers';
import {LEAGUES,espn,curated} from '../../../lib/fixtures';
import {readCache,writeCache} from '../../../lib/cache';
import {plMatch,getPLOfficials,applyPLOfficials} from '../../../lib/pl-officials';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const q=new URL(req.url).searchParams,id=q.get('id')||'',league=q.get('league')||'';
 if(!/^\d{5,12}$/.test(id)||!LEAGUES[league])return Response.json({error:'Некорректный матч'},{status:400});
 const candidate=curated(id),known=candidate?.league===league?candidate:null;
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET,key=`match/v6/${league}/${id}.json`,cached=await readCache(bucket,key);
 const official=plMatch({id,league})?await getPLOfficials(bucket):null;
 const enrich=(match:any)=>applyCurrentAppointment(official?applyPLOfficials({...match,id,league},official):{...match,id,league});
 const ttl=cached?.referee?15*60000:60000;
 if(cached&&Date.now()-Date.parse(cached.fetchedAt)<ttl)return Response.json(enrich(cached),{headers:{'Cache-Control':'no-store'}});
 try{
  const backoff=await readCache(bucket,'referee-updates/source-backoff/site.api.espn.com.json');
  if(backoff?.until>Date.now())throw Object.assign(Error('HTTP 429'),{retryAfter:backoff.until});
  const d=await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[league]}/summary?event=${id}`);
  if(String(d.header?.id)!==id&&!d.header?.competitions?.some((c:any)=>String(c.id)===id))throw Error('Некорректный матч');
  if(d.header?.league?.slug!==LEAGUES[league])throw Error('Другой турнир');
  const c=d.header?.competitions?.[0],h=c?.competitors?.find((t:any)=>t.homeAway==='home'),a=c?.competitors?.find((t:any)=>t.homeAway==='away'),base={home:h?.team?.displayName,away:a?.team?.displayName,date:c?.date,state:c?.status?.type?.state,homeScore:h?.score,awayScore:a?.score,homeLogo:h?.team?.logo,awayLogo:a?.team?.logo};
  const officials=espnOfficials(d.gameInfo?.officials||d.header?.competitions?.[0]?.officials||[]),now=new Date(Date.now()).toISOString();
  const previous=[cached,known].filter(m=>m?.referee).sort((a,b)=>Date.parse(b.appointmentCheckedAt||b.checkedAt)-Date.parse(a.appointmentCheckedAt||a.checkedAt))[0];
  const oldAppointment=!officials.referee&&previous?.referee;
  const result={...(oldAppointment?previous:{}),...Object.fromEntries(Object.entries(base).filter(([,value])=>value!==undefined)),id,league,...(oldAppointment?{}:officials),source:oldAppointment?(previous.appointmentSource||previous.source):d.header?.links?.find((l:any)=>l.rel?.includes('summary'))?.href||`https://www.espn.com/soccer/match/_/gameId/${id}`,checkedAt:oldAppointment?(previous.appointmentCheckedAt||previous.checkedAt):now,appointmentCheckedAt:oldAppointment?(previous.appointmentCheckedAt||previous.checkedAt):now,appointmentSource:oldAppointment?(previous.appointmentSource||previous.source):d.header?.links?.find((l:any)=>l.rel?.includes('summary'))?.href||`https://www.espn.com/soccer/match/_/gameId/${id}`,fetchedAt:now,lastAttemptAt:now,currentVerified:!!officials.referee&&!oldAppointment,appointmentStale:!!oldAppointment,...venueFields(d.gameInfo?.venue||d.header?.competitions?.[0]?.venue),appointmentType:oldAppointment?'Сохранённое назначение':'ESPN · данные матча',...(oldAppointment?{stale:true,error:'В свежем ответе нет имени арбитра. Сохранённое назначение повторно не подтверждено.'}:{})};
  const enriched=enrich(result);await writeCache(bucket,key,enriched);return Response.json(enriched,{headers:{'Cache-Control':'no-store'}})
 }catch(error){
  const now=new Date(Date.now()).toISOString(),rateLimited=String(error).includes('HTTP 429');
  const fallback=cached||known,retryAfter=(error as any)?.retryAfter||Date.now()+60*60*1000;
  if(rateLimited)await writeCache(bucket,'referee-updates/source-backoff/site.api.espn.com.json',{until:retryAfter});
  return Response.json(enrich({...(fallback?{...fallback,stale:true,currentVerified:false}:{}),lastAttemptAt:now,...(rateLimited?{rateLimited:true,retryAfter}:{}),...(!fallback?.referee?{referee:null}:{}),error:'Источник данных матча сейчас недоступен'+(rateLimited?' (HTTP 429)':'')}),{headers:{'Cache-Control':'no-store'}})
 }
}
