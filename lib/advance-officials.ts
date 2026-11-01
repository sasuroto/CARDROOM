import {readCache,writeCache} from './cache';
import {withAppointment} from './fixture-display';
import {links,plain,sitemapArticles,parseSerieA,parseLigue1,parseTFF,type AdvanceRow} from './advance-parsers';
import {loadRFEF} from './advance-rfef';
import {loadPL,loadPortugal} from './advance-api';

const HOUR=3600000,DAY=24*HOUR;
export const ADVANCE_LEAGUES=['epl','laliga','segunda','seriea','ligue1','superlig','primeira'];
const hosts=new Set(['rfef.es','www.legaseriea.it','ligue1.com','www.tff.org','www.premierleague.com','sdp-prem-prod.premier-league-prod.pulselive.com','www.ligaportugal.pt']);
const pending=new Map<string,Promise<any>>();
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases:Record<string,string>={
 estrelamadora:'estrela',estrelaamadora:'estrela',academicodeviseu:'academicoviseu',erzurumbb:'erzurumspor',amedsfk:'amedspor',realsociedadii:'realsociedadb',cdsabadell:'sabadell',
 brightonandhovealbion:'brightonhovealbion',afcbournemouth:'bournemouth',tottenhamhotspur:'tottenhamhotspur',
 casapiaac:'casapia',sportingcp:'sportingcp',moreirensefc:'moreirense',fcporto:'fcporto',estorilpraia:'estoril',fcarouca:'arouca',cdnacional:'nacional',academico:'academicoviseu',academicoviseu:'academicoviseu',academicoviseufc:'academicoviseu',rioavefc:'rioave',maritimom:'maritimo',scbraga:'braga',fcfamalicao:'famalicao',gilvicentefc:'gilvicente',vitoriasc:'vitoriaguimaraes',slbenfica:'benfica',fcalverca:'alverca',
 acmilan:'milan',internazionale:'inter',asroma:'roma',
 havreac:'lehavre',parissaintgermain:'psg',staderennaisfc:'rennes',staderennais:'rennes',ogcnice:'nice',losc:'lille',rclens:'lens',estactroyes:'troyes',lemansfc:'lemans',rcstrasbourgalsace:'strasbourg',ajauxerre:'auxerre',asmonaco:'monaco',olympiquelyonnais:'lyon',angerssco:'angers',olympiquedemarseille:'marseille',toulousefc:'toulouse',fclorient:'lorient',stadebrestois29:'brest',
 tumosankonyaspor:'konyaspor',galatasarayas:'galatasaray',erzurumsporfk:'erzurumspor',arcacorumfk:'corumfk',caykurrizesporas:'rizespor',caykurrizespor:'rizespor',fenerbahceas:'fenerbahce',goztepeas:'goztepe',amedsportiffaaliyetler:'amedspor',trabzonsporas:'trabzonspor',gaziantepfutbolkulubuas:'gaziantepfk',istanbulbasaksehirfk:'istanbulbasaksehir',samsunsporas:'samsunspor',kasimpasaas:'kasimpasa',besiktasas:'besiktas',corendonalanyaspor:'alanyaspor',
 levanteud:'levante',clubatleticodemadrid:'atleticomadrid',rayovallecanodemadrid:'rayovallecano',rcceltadevigo:'celtavigo',realbetisbalompie:'realbetis',malagacf:'malaga',fcbarcelona:'barcelona',deportivoalaves:'alaves',getafecf:'getafe',sevillafc:'sevilla',realracingclubdesantander:'racingsantander',realmadridcf:'realmadrid',elchecf:'elche',valenciacf:'valencia',athleticclub:'athleticbilbao',realsociedaddefutbol:'realsociedad',
 sdeibar:'eibar',udalmeria:'almeria',rcceltafortuna:'celtavigob',celtafortuna:'celtavigob',cordobacf:'cordoba',albacetebalompie:'albacete',cesabadellfc:'sabadell',gironavfc:'girona',gironafc:'girona',cdeldense:'eldense',granadacf:'granada',adceutafc:'ceuta',realsportingdegijon:'sportinggijon',burgoscf:'burgos',cdcastellon:'castellon',cdtenerife:'tenerife',fcandorra:'andorra'
};
export function advanceTeam(name:string,league:string){const key=normalize(name);if(league==='segunda'&&key==='realsociedaddefutbolsad')return 'realsociedadb';return aliases[key]||key}
const identity=(r:AdvanceRow)=>`${r.league}:${r.day||r.from}:${advanceTeam(r.home,r.league)}:${advanceTeam(r.away,r.league)}`;
export async function readAdvanceSource(url:string,bucket:R2Bucket|undefined,binary=false):Promise<any>{
 let target=new URL(url);if(target.protocol!=='https:'||!hosts.has(target.hostname)||target.username||target.password)throw Error('Unapproved appointment source');
 const key=`referee-updates/source-backoff/${target.hostname}.json`,backoff=await readCache(bucket,key),now=Date.now();
 if(backoff?.until>now)throw Object.assign(Error(`${target.hostname}: cooldown`),{retryAt:backoff.until});
 for(let hop=0;hop<4;hop++){
  const r=await fetch(target.href,{redirect:'manual',signal:AbortSignal.timeout(14000),headers:{Accept:binary?'application/pdf':'text/html,application/xml,application/json'}});
  if([301,302,303,307,308].includes(r.status)){const next=new URL(r.headers.get('Location')||'',target);if(next.origin!==target.origin)throw Error('Unapproved source redirect');target=next;continue}
  if(!r.ok){const retry=r.headers.get('Retry-After'),seconds=retry?Number(retry):NaN,until=Math.max(now+(r.status===403?6:1)*HOUR,retry?(Number.isFinite(seconds)?now+seconds*1000:Date.parse(retry))||0:0);if([403,429].includes(r.status))await writeCache(bucket,key,{until,status:r.status});throw Object.assign(Error(`${target.hostname}: HTTP ${r.status}`),{retryAt:until})}
  // Liga Portugal includes team profiles in the official round response (~4 MB).
  const limit=target.hostname==='www.ligaportugal.pt'?6_000_000:3_000_000;
  if(Number(r.headers.get('Content-Length'))>limit)throw Error('Source exceeds size limit');
  const buffer=await r.arrayBuffer();if(buffer.byteLength>limit)throw Error('Source exceeds size limit');
  if(binary)return new Uint8Array(buffer);
  return new TextDecoder(target.hostname==='www.tff.org'?'windows-1254':'utf-8').decode(buffer);
 }
 throw Error('Source redirect limit');
}
async function load(league:string,read:(url:string,binary?:boolean)=>Promise<any>,prior:any){
 if(league==='epl')return loadPL(read);
 if(league==='primeira')return loadPortugal(read);
 if(league==='laliga'||league==='segunda')return loadRFEF(league,read,prior?.sources||[]);
 if(league==='superlig'){const source='https://www.tff.org/default.aspx?ftxtID=2966&pageID=600';return {rows:parseTFF(await read(source),source),sources:[source],errors:[]}}
 const italian=league==='seriea';
 const index=italian?'https://www.legaseriea.it/sitemap-article.xml':'https://ligue1.com/api/sitemap/sitemap-articles-l1-fr';
 const found=sitemapArticles(await read(index),italian?/\/serie-a\/news\/.*designazioni-arbitrali/:/\/fr\/articles\/.*arbitres.*ligue-1/);
 const allowed=(u:string)=>italian?u.startsWith('https://www.legaseriea.it/serie-a/news/'):u.startsWith('https://ligue1.com/fr/articles/');
 const sources=[...new Set([...found.map(x=>x.url),...(prior?.sources||[]).filter(allowed)])].filter(allowed).slice(0,3),rows:AdvanceRow[]=[],errors:string[]=[];
 for(const source of sources){try{rows.push(...(italian?parseSerieA:parseLigue1)(await read(source),source))}catch(e){errors.push(`${source}: ${String(e)}`);if(/HTTP (403|429)|cooldown/.test(String(e)))break}}
 if(!rows.length)throw Error(errors.join('; ')||'No current appointment articles');return {rows,sources,errors};
}
export async function getAdvanceOfficials(league:string,bucket:R2Bucket|undefined){
 if(!ADVANCE_LEAGUES.includes(league))return null;
 const key=`official-appointments/advance/${league==='epl'?'v2':'v1'}/${league}.json`,saved=await readCache(bucket,key),legacy=!saved&&league==='epl'?await readCache(bucket,'official-appointments/advance/v1/epl.json'):null,cached=saved||(legacy?.rows?.length?legacy:null),now=Date.now();
 if(cached&&Date.parse(cached.nextCheckAt)>now)return cached;
 if(pending.has(league))return pending.get(league);
 const work=(async()=>{let result:any;
  try{
   const deadline=now+26000;
   const response=await load(league,(u,b)=>{if(Date.now()>deadline)throw Error('Appointment source time budget exceeded');return readAdvanceSource(u,bucket,b)},cached),checkedAt=new Date(now).toISOString();
   const fresh=response.rows.filter(r=>Date.parse(r.day||r.until||'')>now-14*DAY&&Date.parse(r.day||r.from||'')<now+30*DAY).map(r=>({...r,checkedAt,stale:false}));
   if(!fresh.length)throw Error('No appointments in the current date window');
   const ids=new Set(fresh.map(identity)),old=(cached?.rows||[]).filter((r:AdvanceRow)=>!ids.has(identity(r))&&Date.parse(r.day||r.until||'')>now-30*DAY).map((r:AdvanceRow)=>({...r,stale:true}));
   result={league,...response,rows:[...fresh,...old],checkedAt,lastAttemptAt:checkedAt,nextCheckAt:new Date(now+HOUR).toISOString(),stale:false};
  }catch(e){result={...(cached||{league,rows:[],sources:[]}),stale:true,error:String(e),lastAttemptAt:new Date(now).toISOString(),nextCheckAt:new Date(Math.max(now+HOUR,(e as any).retryAt||0)).toISOString()}}
  await writeCache(bucket,key,result);return result;
 })();pending.set(league,work);try{return await work}finally{pending.delete(league)}
}
export function applyAdvanceOfficials(match:any,report:any){
 if(!report||!match.home||!match.away||!Number.isFinite(Date.parse(match.date||'')))return match;
 const day=new Date(match.date).toISOString().slice(0,10);
 const rows=(report.rows||[]).filter((r:AdvanceRow)=>r.league===match.league&&(r.day?r.day===day:!!r.from&&!!r.until&&day>=r.from&&day<=r.until)&&advanceTeam(r.home,r.league)===advanceTeam(match.home,match.league)&&advanceTeam(r.away,r.league)===advanceTeam(match.away,match.league));
 const unique=[...new Map(rows.map((r:AdvanceRow)=>[r.source+':'+r.referee,r])).values()] as AdvanceRow[];
 // Multiple publications with different names are not silently resolved.
 if(!unique.length||new Set(unique.map(r=>normalize(r.referee))).size!==1)return !match.referee?{...match,appointmentError:unique.length?'Конфликт официальных публикаций':report.error||'Назначение пока не найдено в опубликованных списках',appointmentLastAttempt:report.lastAttemptAt}:match;
 const row=unique[0],stale=!!report.stale||!!row.stale;
 return withAppointment(match,{...row,appointmentSource:row.source,appointmentType:'Официальное назначение · '+new URL(row.source).hostname,appointmentCheckedAt:row.checkedAt,appointmentLastAttempt:report.lastAttemptAt,appointmentStale:stale,currentVerified:!stale,appointmentError:stale?(report.error||'Сохранено последнее подтверждённое назначение'):null});
}
