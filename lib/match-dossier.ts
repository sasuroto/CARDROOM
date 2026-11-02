// Bounded public match facts only. A provider observation is not an official club notice.
export type DossierPlayer={id:string;name:string;position:string|null;jersey:string|null};
export type DossierLineup={status:'source-confirmed'|'partial'|'unavailable'|'stale';checkedAt:string|null;lastAttemptAt:string;formation:string|null;starters:DossierPlayer[];bench:DossierPlayer[];note:string};
export type DossierTeam={id:string;name:string;side:'home'|'away';score:number|null;lineup:DossierLineup};
export type DossierEvent={id:string;type:string;label:string;minute:string|null;teamId:string|null;participants:{id:string;name:string}[];sourceTime:string|null};
export type DossierChange={kind:'lineup';teamId:string;observedAt:string;previousObservedAt:string;added:DossierPlayer[];removed:DossierPlayer[];note:string};
export type MatchDossier={schemaVersion:1;id:string;league:string;kickoff:string|null;source:string;fetchedAt:string;state:'pre'|'in'|'post'|'unknown';clock:string|null;teams:DossierTeam[];events:{status:'source-confirmed'|'unavailable';items:DossierEvent[];checkedAt:string};availability:{status:'unavailable';note:string};attendance:number|null;changes:DossierChange[]};
export type DossierContext={id:string;league:string;fetchedAt:string};
// Source DTOs describe optional provider structure; all scalar fields remain unknown
// until bounded parsers above/below validate them.
interface SourceTeam {id?:unknown;displayName?:unknown}
interface SourceCompetitor {homeAway?:unknown;team?:SourceTeam;score?:unknown}
interface SourcePlayer {athlete?:{id?:unknown;displayName?:unknown};position?:{abbreviation?:unknown};jersey?:unknown;starter?:unknown}
interface SourceRoster {team?:SourceTeam;formation?:unknown;roster?:unknown}
interface SourceEvent {id?:unknown;type?:{type?:unknown};team?:SourceTeam;participants?:unknown;clock?:{displayValue?:unknown};wallclock?:unknown}
interface SourceCompetition {id?:unknown;date?:unknown;competitors?:unknown;status?:{type?:{state?:unknown};displayClock?:unknown}}
interface SourceSummary {header?:{id?:unknown;league?:{slug?:unknown};competitions?:SourceCompetition[]};rosters?:unknown;keyEvents?:unknown;gameInfo?:{attendance?:unknown}}
interface ValidSummary extends SourceSummary {header:{id?:unknown;league:{slug:string};competitions:[SourceCompetition & {competitors:(SourceCompetitor & {team:SourceTeam})[]},...SourceCompetition[]]}}
const leagues:Record<string,string>={epl:'eng.1',ucl:'uefa.champions',laliga:'esp.1',segunda:'esp.2',seriea:'ita.1',bundesliga:'ger.1',ligue1:'fra.1',superlig:'tur.1',primeira:'por.1'};
const text=(v:unknown,n=160)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n):'';
const id=(v:unknown)=>typeof v==='string'||typeof v==='number'?(/^\d{1,16}$/.test(String(v))?String(v):null):null;
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
const array=<T,>(v:unknown):T[]=>Array.isArray(v)?v:[];
const score=(v:unknown)=>['number','string'].includes(typeof v)&&String(v).trim()!==''&&Number.isInteger(Number(v))&&Number(v)>=0&&Number(v)<=100?Number(v):null;
export function validateDossierSummary(input:unknown,context:DossierContext):input is ValidSummary{
 const summary=input as SourceSummary|null|undefined;
 const c=summary?.header?.competitions?.[0],teams=array<SourceCompetitor>(c?.competitors);
 return !!(/^\d{5,12}$/.test(context.id)&&leagues[context.league]&&date(context.fetchedAt)&&c&&id(c.id??summary?.header?.id)===context.id&&(!summary?.header?.id||id(summary.header.id)===context.id)&&summary.header?.league?.slug===leagues[context.league]&&teams.length===2&&teams.filter(t=>t.homeAway==='home').length===1&&teams.filter(t=>t.homeAway==='away').length===1&&teams.every(t=>id(t.team?.id)&&text(t.team?.displayName))&&id(teams[0].team?.id)!==id(teams[1].team?.id));
}
function player(p:SourcePlayer):DossierPlayer|null{
 const playerId=id(p?.athlete?.id),name=text(p?.athlete?.displayName);if(!playerId||!name)return null;
 return {id:playerId,name,position:text(p.position?.abbreviation,20)||null,jersey:text(String(p.jersey??''),5)||null};
}
function lineup(raw:SourceRoster|null,at:string,old?:DossierLineup):DossierLineup{
 const rows=array<SourcePlayer>(raw?.roster).slice(0,80),seen=new Set<string>();let duplicate=false;
 const starters:DossierPlayer[]=[],bench:DossierPlayer[]=[];
 for(const p of rows){const item=player(p);if(!item||typeof p.starter!=='boolean')continue;if(seen.has(item.id)){duplicate=true;continue}seen.add(item.id);(p.starter?starters:bench).push(item)}
 const confirmed=starters.length===11&&!duplicate,partial=starters.length>0||bench.length>0;
 // A missing/partial feed is not proof that a previously announced player was removed.
 if(!confirmed&&old&&(old.status==='source-confirmed'||old.status==='stale')&&old.starters?.length===11&&old.checkedAt){return {...old,status:'stale',lastAttemptAt:at,note:'Последний полный состав по ESPN. В новом ответе нет полного состава; изменения не подтверждены.'}}
 return {status:confirmed?'source-confirmed':partial?'partial':'unavailable',checkedAt:partial?at:null,lastAttemptAt:at,formation:confirmed?text(raw?.formation,30)||null:null,starters,bench:bench.slice(0,30),note:confirmed?'11 игроков старта по ESPN; это подтверждение провайдера, не отдельная публикация клуба.':partial?'Источник передал только часть состава; полный старт не подтверждён.':'Источник пока не передал состав. Это не означает отсутствие игроков.'};
}
const matchState=(value:unknown):MatchDossier['state']=>value==='pre'||value==='in'||value==='post'?value:'unknown';
const eventLabels:Record<string,string>={'goal':'Гол','own-goal':'Автогол','penalty---scored':'Гол с пенальти','penalty-scored':'Гол с пенальти','yellow-card':'Жёлтая карточка','red-card':'Красная карточка','yellow-red-card':'Удаление за вторую жёлтую','substitution':'Замена','kickoff':'Начало периода','halftime':'Перерыв','full-time':'Матч завершён','end-of-half':'Конец периода','start-delay':'Пауза','end-delay':'Игра возобновлена'};
export function buildMatchDossier(summary:unknown,context:DossierContext,previous?:MatchDossier|null):MatchDossier{
 if(!validateDossierSummary(summary,context))throw new Error('Dossier source does not match fixture, league or timestamp');
 const c=summary.header.competitions[0],kickoff=date(c.date),state=matchState(c.status?.type?.state),source=`https://www.espn.com/soccer/match/_/gameId/${context.id}`;
 const previousValid=previous?.schemaVersion===1&&previous.id===context.id&&previous.league===context.league&&!!kickoff&&Date.parse(previous.kickoff||'')===Date.parse(kickoff)&&date(previous.fetchedAt)&&Date.parse(previous.fetchedAt)<=Date.parse(context.fetchedAt);
 const old=previousValid?previous:null,changes:DossierChange[]=old?array<DossierChange>(old.changes).slice(-30):[];
 const teams:DossierTeam[]=['home','away'].map(side=>{const t=c.competitors.find(t=>t.homeAway===side)!,teamId=String(t.team.id),rosters=array<SourceRoster>(summary.rosters).filter(r=>id(r.team?.id)===teamId),prior=old?.teams.find(t=>t.id===teamId&&t.side===side)?.lineup;
  const current=lineup(rosters.length===1?rosters[0]:null,context.fetchedAt,prior);
  if(state==='pre'&&old?.state==='pre'&&Date.parse(old.fetchedAt)<Date.parse(context.fetchedAt)&&current.status==='source-confirmed'&&prior&&['source-confirmed','stale'].includes(prior.status)&&prior.checkedAt){const added=current.starters.filter(p=>!prior.starters.some(q=>q.id===p.id)),removed=prior.starters.filter(p=>!current.starters.some(q=>q.id===p.id));if(added.length||removed.length)changes.push({kind:'lineup',teamId,observedAt:context.fetchedAt,previousObservedAt:prior.checkedAt,added,removed,note:'Изменилось в источнике между двумя предматчевыми проверками. Время обнаружения, не время решения тренера; возможна коррекция источника.'})}
  return {id:teamId,name:text(t.team.displayName),side:side as 'home'|'away',score:state==='pre'?null:score(t.score),lineup:current};
 });
 const seen=new Set<string>(),events:DossierEvent[]=[];
 if(state==='in'||state==='post')for(const e of array<SourceEvent>(summary.keyEvents).slice(0,500)){
  const eventId=id(e?.id),type=text(e?.type?.type,50),label=eventLabels[type],teamId=id(e?.team?.id);
  if(!eventId||seen.has(eventId)||!label||(teamId&&!teams.some(t=>t.id===teamId)))continue;seen.add(eventId);
  const participants=array<SourcePlayer>(e.participants).slice(0,4).map(p=>({id:id(p.athlete?.id),name:text(p.athlete?.displayName)})).filter(p=>p.id&&p.name) as {id:string;name:string}[];
  events.push({id:eventId,type,label,minute:text(e.clock?.displayValue,20)||null,teamId,participants,sourceTime:date(e.wallclock)});if(events.length===100)break;
 }
 const attendance=summary.gameInfo?.attendance;
 return {schemaVersion:1,...context,kickoff,source,state,clock:text(c.status?.displayClock,20)||null,teams,events:{status:events.length?'source-confirmed':'unavailable',items:events,checkedAt:context.fetchedAt},availability:{status:'unavailable',note:'Автоматическая лента травм, дисквалификаций и заявок клуба не подключена. Отсутствие игрока в составе не объясняет причину.'},attendance:typeof attendance==='number'&&Number.isInteger(attendance)&&attendance>0&&attendance<=250000?attendance:null,changes:changes.slice(-30)};
}
