import {teamLogo,logoUrl} from '../../../lib/team-logo';
import {getUEFAOfficials,applyUEFAOfficials} from '../../../lib/uefa-officials';
import {getDFBOfficials,applyDFBOfficials} from '../../../lib/dfb-officials';
import {getAdvanceOfficials,applyAdvanceOfficials} from '../../../lib/advance-officials';
import {applyCurrentAppointment} from '../../../lib/current-context';
import {venueFields} from '../../../lib/match-location';
import {espnOfficials} from '../../../lib/match-officials';
import {env} from 'cloudflare:workers';
import {LEAGUES,espn,curated} from '../../../lib/fixtures';
import {readCache,writeCache} from '../../../lib/cache';
import {plMatch,getPLOfficials,applyPLOfficials} from '../../../lib/pl-officials';
import {appointmentTier,conflictNote,matchTtl,logSourceError} from '../../../lib/referee-authority';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const q=new URL(req.url).searchParams,id=q.get('id')||'',league=q.get('league')||'';
 if(!/^\d{5,12}$/.test(id)||!LEAGUES[league])return Response.json({error:'Некорректный матч'},{status:400});
 const candidate=curated(id),known=candidate?.league===league?candidate:null;
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET,key=`match/v6/${league}/${id}.json`,cached=await readCache(bucket,key);
 const official=plMatch({id,league})?await getPLOfficials(bucket):null;
 const uefa=league==='ucl'?await getUEFAOfficials(bucket):null;
 const dfb=league==='bundesliga'?await getDFBOfficials(bucket):null;
 const advance=await getAdvanceOfficials(league,bucket);
 const finish=(match:any)=>{const m=applyCurrentAppointment(uefa?applyUEFAOfficials(match,uefa):match);return applyAdvanceOfficials(dfb?applyDFBOfficials(m,dfb):m,advance)};
 const enrich=(match:any)=>finish(official?applyPLOfficials({...match,id,league},official):{...match,id,league});
 const ttl=matchTtl(cached);
 if(cached&&Date.now()-Date.parse(cached.fetchedAt)<ttl)return Response.json(enrich(cached),{headers:{'Cache-Control':'no-store'}});
 try{
  const backoff=await readCache(bucket,'referee-updates/source-backoff/site.api.espn.com.json');
  if(backoff?.until>Date.now())throw Object.assign(Error('HTTP 429'),{retryAfter:backoff.until});
  const d=await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[league]}/summary?event=${id}`);
  if(String(d.header?.id)!==id&&!d.header?.competitions?.some((c:any)=>String(c.id)===id))throw Error('Некорректный матч');
  if(d.header?.league?.slug!==LEAGUES[league])throw Error('Другой турнир');
  const c=d.header?.competitions?.[0],h=c?.competitors?.find((t:any)=>t.homeAway==='home'),a=c?.competitors?.find((t:any)=>t.homeAway==='away'),base={home:h?.team?.displayName,away:a?.team?.displayName,date:c?.date,state:c?.status?.type?.state,clock:c?.status?.displayClock,statusName:c?.status?.type?.name,statusDetail:c?.status?.type?.shortDetail,homeScore:h?.score,awayScore:a?.score,homeLogo:teamLogo(h?.team)||logoUrl(cached?.homeLogo)||logoUrl(known?.homeLogo),awayLogo:teamLogo(a?.team)||logoUrl(cached?.awayLogo)||logoUrl(known?.awayLogo)};
  const officials=espnOfficials(d.gameInfo?.officials||d.header?.competitions?.[0]?.officials||[]),now=new Date(Date.now()).toISOString();
  const previous=[cached,known].filter(m=>m?.referee).sort((a,b)=>appointmentTier(b)-appointmentTier(a)||Date.parse(b.appointmentCheckedAt||b.checkedAt)-Date.parse(a.appointmentCheckedAt||a.checkedAt))[0];
  const officialPrevious=!!previous?.referee&&appointmentTier(previous)===2&&(!previous.date||!c?.date||Date.parse(previous.date)===Date.parse(c.date));
  const oldAppointment=(!officials.referee||officialPrevious)&&previous?.referee;
  const protectedOfficial=officialPrevious,officialStale=protectedOfficial&&(!!previous.appointmentStale||previous.currentVerified===false);
  const result={...(oldAppointment?previous:{}),...Object.fromEntries(Object.entries(base).filter(([,value])=>value!==undefined)),id,league,...(oldAppointment?{}:officials),source:oldAppointment?(previous.appointmentSource||previous.source):d.header?.links?.find((l:any)=>l.rel?.includes('summary'))?.href||`https://www.espn.com/soccer/match/_/gameId/${id}`,checkedAt:oldAppointment?(previous.appointmentCheckedAt||previous.checkedAt):now,appointmentCheckedAt:oldAppointment?(previous.appointmentCheckedAt||previous.checkedAt):now,appointmentSource:oldAppointment?(previous.appointmentSource||previous.source):d.header?.links?.find((l:any)=>l.rel?.includes('summary'))?.href||`https://www.espn.com/soccer/match/_/gameId/${id}`,fetchedAt:now,lastAttemptAt:now,currentVerified:protectedOfficial?!officialStale:!!officials.referee&&!oldAppointment,appointmentStale:protectedOfficial?officialStale:!!oldAppointment,appointmentConflict:protectedOfficial&&officials.referee?conflictNote(previous,{...officials,appointmentSource:'https://www.espn.com/soccer/'}):null,...venueFields(d.gameInfo?.venue||d.header?.competitions?.[0]?.venue),appointmentType:protectedOfficial?previous.appointmentType:oldAppointment?'Сохранённое назначение':'ESPN · данные матча',...(oldAppointment&&!protectedOfficial?{stale:true,error:'В свежем ответе нет имени арбитра. Сохранённое назначение повторно не подтверждено.'}:{})};
  const enriched=enrich(result);await writeCache(bucket,key,enriched);return Response.json(enriched,{headers:{'Cache-Control':'no-store'}})
 }catch(error){
  const now=new Date(Date.now()).toISOString(),rateLimited=String(error).includes('HTTP 429');
  logSourceError('site.api.espn.com/summary',error,{id,league,rateLimited});
  const fallback=cached||known,retryAfter=(error as any)?.retryAfter||Date.now()+60*60*1000;
  if(rateLimited)await writeCache(bucket,'referee-updates/source-backoff/site.api.espn.com.json',{until:retryAfter});
  return Response.json(enrich({...(fallback?{...fallback,stale:true,currentVerified:false}:{}),lastAttemptAt:now,...(rateLimited?{rateLimited:true,retryAfter}:{}),...(!fallback?.referee?{referee:null}:{}),error:'Источник данных матча сейчас недоступен'+(rateLimited?' (HTTP 429)':'')}),{headers:{'Cache-Control':'no-store'}})
 }
}
