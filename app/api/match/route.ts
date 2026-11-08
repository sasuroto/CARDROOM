import {buildMatchDossier} from '../../../lib/match-dossier';
import {normalizeStatusSnapshot} from '../../../lib/match-status-evidence';
import {teamLogo,logoUrl} from '../../../lib/team-logo';
import {getUEFAOfficials,applyUEFAOfficials} from '../../../lib/uefa-officials';
import {enrichUEFACrew} from '../../../lib/uefa-crew';
import {getDFBOfficials,applyDFBOfficials} from '../../../lib/dfb-officials';
import {getAdvanceOfficials,applyAdvanceOfficials} from '../../../lib/advance-officials';
import {applyCurrentAppointment} from '../../../lib/current-context';
import {venueFields,normalizeMatchLocation} from '../../../lib/match-location';
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
 const enrich=async(match:any)=>enrichUEFACrew(normalizeMatchLocation(finish(official?applyPLOfficials({...match,id,league},official):{...match,id,league})),bucket);
 const ttl=matchTtl(cached),needsEvidence=q.get('evidence')==='1';
 if(cached&&(!needsEvidence||Object.prototype.hasOwnProperty.call(cached,'dossier')&&typeof cached.statusStale==='boolean')&&Date.now()-Date.parse(cached.fetchedAt)<ttl)return Response.json(await enrich(cached),{headers:{'Cache-Control':'no-store'}});
 try{
  const backoff=await readCache(bucket,'referee-updates/source-backoff/site.api.espn.com.json');
  if(backoff?.until>Date.now())throw Object.assign(Error('HTTP 429'),{retryAfter:backoff.until});
  const d=await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[league]}/summary?event=${id}`,bucket);
  if(String(d.header?.id)!==id&&!d.header?.competitions?.some((c:any)=>String(c.id)===id))throw Error('Некорректный матч');
  if(d.header?.league?.slug!==LEAGUES[league])throw Error('Другой турнир');
  const c=d.header?.competitions?.[0],h=c?.competitors?.find((t:any)=>t.homeAway==='home'),a=c?.competitors?.find((t:any)=>t.homeAway==='away'),base={period:c?.status?.period??null,homeId:h?.team?.id??null,awayId:a?.team?.id??null,home:h?.team?.displayName,away:a?.team?.displayName,date:c?.date,state:c?.status?.type?.state,clock:c?.status?.displayClock,statusName:c?.status?.type?.name,statusDetail:c?.status?.type?.shortDetail,homeScore:h?.score,awayScore:a?.score,homeLogo:teamLogo(h?.team)||logoUrl(cached?.homeLogo)||logoUrl(known?.homeLogo),awayLogo:teamLogo(a?.team)||logoUrl(cached?.awayLogo)||logoUrl(known?.awayLogo)};
  const officials=espnOfficials(d.gameInfo?.officials||d.header?.competitions?.[0]?.officials||[]),now=new Date(Date.now()).toISOString();
  const previous=[cached,known].filter(m=>m?.referee).sort((a,b)=>appointmentTier(b)-appointmentTier(a)||Date.parse(b.appointmentCheckedAt||b.checkedAt)-Date.parse(a.appointmentCheckedAt||a.checkedAt))[0];
  const officialPrevious=!!previous?.referee&&appointmentTier(previous)===2&&(!previous.date||!c?.date||Date.parse(previous.date)===Date.parse(c.date));
  const oldAppointment=(!officials.referee||officialPrevious)&&previous?.referee;
  const protectedOfficial=officialPrevious,officialStale=protectedOfficial&&(!!previous.appointmentStale||previous.currentVerified===false);
  const result={...(oldAppointment?previous:{}),...Object.fromEntries(Object.entries(base).filter(([,value])=>value!==undefined)),id,league,...(oldAppointment?{}:officials),source:oldAppointment?(previous.appointmentSource||previous.source):d.header?.links?.find((l:any)=>l.rel?.includes('summary'))?.href||`https://www.espn.com/soccer/match/_/gameId/${id}`,checkedAt:oldAppointment?(previous.appointmentCheckedAt||previous.checkedAt):now,appointmentCheckedAt:oldAppointment?(previous.appointmentCheckedAt||previous.checkedAt):now,appointmentSource:oldAppointment?(previous.appointmentSource||previous.source):d.header?.links?.find((l:any)=>l.rel?.includes('summary'))?.href||`https://www.espn.com/soccer/match/_/gameId/${id}`,fetchedAt:now,lastAttemptAt:now,currentVerified:protectedOfficial?!officialStale:!!officials.referee&&!oldAppointment,appointmentStale:protectedOfficial?officialStale:!!oldAppointment,appointmentConflict:protectedOfficial&&officials.referee?conflictNote(previous,{...officials,appointmentSource:'https://www.espn.com/soccer/'}):null,...venueFields(d.gameInfo?.venue||d.header?.competitions?.[0]?.venue),appointmentType:protectedOfficial?previous.appointmentType:oldAppointment?'Сохранённое назначение':'ESPN · данные матча',...(oldAppointment&&!protectedOfficial?{stale:true,error:'В свежем ответе нет имени арбитра. Сохранённое назначение повторно не подтверждено.'}:{})};
  let dossier=cached?.dossier&&Date.parse(cached.dossier.kickoff||'')===Date.parse(result.date||'')?cached.dossier:null,dossierError:string|null=null;
  try{dossier=buildMatchDossier(d,{id,league,fetchedAt:now},cached?.dossier)}catch{dossierError='Источник не передал согласованные данные состава и событий; сохранённое досье повторно не подтверждено.'}
  const statusSource=`https://www.espn.com/soccer/match/_/gameId/${id}`;
  const validStatus=['pre','in','post'].includes(base.state)&&h?.team?.displayName&&a?.team?.displayName&&h.team.displayName!==a.team.displayName&&(!h.team.id||!a.team.id||String(h.team.id)!==String(a.team.id));
  const statusSnapshot=normalizeStatusSnapshot(validStatus?base:cached);
  const enriched=await enrich({...result,...statusSnapshot,dossier,dossierError,statusCheckedAt:validStatus?now:cached?.statusCheckedAt||cached?.fetchedAt,statusLastAttemptAt:now,statusStale:!validStatus,statusError:validStatus?null:'Источник не передал согласованный статус и команды матча.',statusSource:validStatus?statusSource:cached?.statusSource||null});await writeCache(bucket,key,enriched);return Response.json(enriched,{headers:{'Cache-Control':'no-store'}})
 }catch(error){
  const now=new Date(Date.now()).toISOString(),rateLimited=String(error).includes('HTTP 429');
  logSourceError('site.api.espn.com/summary',error,{id,league,rateLimited});
  const fallback=cached||known,retryAfter=(error as any)?.retryAfter||Date.now()+60*60*1000;
  return Response.json(await enrich({...(fallback?{...fallback,stale:true,currentVerified:false}:{}),lastAttemptAt:now,statusCheckedAt:fallback?.statusCheckedAt||fallback?.fetchedAt,statusLastAttemptAt:now,statusStale:true,statusError:'Не удалось обновить счёт и статус матча.',...(rateLimited?{rateLimited:true,retryAfter,...((error as {cooldownPersisted?:boolean})?.cooldownPersisted===false?{cooldownPersisted:false}:{})}:{}),...(!fallback?.referee?{referee:null}:{}),error:'Источник данных матча сейчас недоступен'+(rateLimited?' (HTTP 429)':'')}),{headers:{'Cache-Control':'no-store'}})
 }
}
