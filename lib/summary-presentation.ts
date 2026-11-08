import {classifyDataBlock, type DataBlockState} from './data-health';

type Snapshot={checkedAt?:string|null;source?:string|null;n?:number|null;avg?:number|null;derived?:boolean};
export type SummaryLeague={id:string;season:string;cards?:Snapshot;yellowSummary?:Snapshot;overview?:Snapshot&{goals?:number|null;fouls?:number|null;shots?:number|null;btts?:number|null};partial?:boolean;teamRefreshMode?:string;teamSource?:string|null;teamCheckedAt?:string|null};
export type SummaryData={refreshErrors?:string[]};
export type RefereeGroup={rows?:unknown[];checkedAt?:string|null;source?:string|null;partial?:boolean;refreshError?:string|null;dataNote?:string|null};
export type RefereeUpdate={startedAt?:string|null;errors?:string[]};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const successfulDate=(v:unknown,now:number):string|null=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=now?v:null;
const labels:Record<DataBlockState,string>={missing:'Данные не получены',unavailable:'Обновление недоступно',snapshot:'Сохранённый срез',stale:'Срез устарел',partial:'Неполное покрытие',fresh:'Проверено за последние 6 часов'};
const descriptions:Record<Exclude<DataBlockState,'missing'>,string>={unavailable:'Показаны прежние значения и дата успешного чтения.',snapshot:'Автоматическое обновление этого среза не подключено.',stale:'Последнее успешное чтение было более 6 часов назад.',partial:'Покрытие источника неполное.',fresh:'Дата чтения источника, не гарантия обновления поставщика.'};
export function summaryBlockStatuses(data:SummaryData,league:SummaryLeague,now=Date.now()){
 const teamDerived=league.yellowSummary?.derived===true&&!!league.teamSource&&league.yellowSummary.source===league.teamSource;
 const sameTeamSnapshot=teamDerived&&!!league.yellowSummary?.checkedAt&&league.yellowSummary.checkedAt===league.teamCheckedAt;
 const groups=[
  {key:'overview',label:'Голы, фолы, удары, ОЗ',snapshot:league.overview,values:[league.overview?.goals,league.overview?.fouls,league.overview?.shots,league.overview?.btts],manual:false,partial:false,errorKeys:['overview']},
  {key:'cards',label:'Все карточки',snapshot:league.cards,values:[league.cards?.avg],manual:false,partial:false,errorKeys:['cards']},
  {key:'yellow',label:'ЖК / матч',snapshot:league.yellowSummary,values:[league.yellowSummary?.avg],manual:teamDerived&&league.teamRefreshMode==='snapshot',partial:sameTeamSnapshot&&!!league.partial,errorKeys:league.id==='segunda'?['yellow-summary']:['yellow']}
 ];
 return groups.map(group=>{
  const hasValues=group.values.some(finite),checkedAt=successfulDate(group.snapshot?.checkedAt,now);
  const error=(data.refreshErrors||[]).some(error=>group.errorKeys.some(key=>error.startsWith(league.id+': '+key+':')));
  const state=classifyDataBlock(hasValues?checkedAt:null,group.manual,group.partial,error,now);
  const label=state==='missing'&&hasValues?'Дата среза не подтверждена':labels[state];
  const description=state==='missing'?(hasValues?'Сохранённые значения без подтверждённой даты чтения.':error?'Последняя проверка источника недоступна; подтверждённых значений нет.':'Подтверждённых значений пока нет.'):descriptions[state];
  const n=group.snapshot?.n;
  return {key:group.key,label:group.label,state,statusLabel:label,description,checkedAt,source:group.snapshot?.source||null,sampleSize:finite(n)&&Number.isInteger(n)&&n>=0?n:null};
 });
}
export function refereeTableStatus(group:RefereeGroup|undefined,visibleRows:number,update?:RefereeUpdate,now=Date.now()){
 const total=group?.rows?.length||0,checkedAt=successfulDate(group?.checkedAt,now);
 const updateTime=Date.parse(update?.startedAt||'');
 const error=!!group?.refreshError||(Number.isFinite(updateTime)&&updateTime<=now&&(!checkedAt||updateTime>=Date.parse(checkedAt))&&!!update?.errors?.some(error=>error.startsWith('Статистика')));
 const filtered=total>0&&visibleRows===0;
 const notice=total>0?[
  error?'Авточтение источника пока недоступно; показаны сохранённые строки.':null,
  group?.dataNote,
  group?.partial?'Частичная подборка судей источника.':null,
 ].filter(Boolean).join(' '):error?'Авточтение источника пока недоступно; подтверждённых строк сезонной таблицы нет.':checkedAt?'Подтверждённых строк сезонной таблицы пока нет.':'Сезонная таблица арбитров пока не получена.';
 return {total,checkedAt,error,filtered,notice,
  emptyTitle:filtered?'Нет судей с такими условиями':'Сезонная таблица арбитров пока не подтверждена',
  emptyDescription:filtered?'Уменьшите минимальную выборку или измените запрос.':'Назначение конкретного арбитра и доступная статистика проверяются отдельно в панели матча.',
 };
}
export function snapshotDateLabel(value:string|null){
 return value?new Date(value).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' · UTC+4':'Дата успешного среза не подтверждена';
}
