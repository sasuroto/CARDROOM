import {refereeTableStatus,snapshotDateLabel,type RefereeGroup,type RefereeUpdate} from '../lib/summary-presentation';

type Props={group?:RefereeGroup;update?:RefereeUpdate};
export function RefereeTableNotice({group,update,league}:{league:string}&Props){
 const status=refereeTableStatus(group,group?.rows?.length||0,update);
 return <div className="notice">{status.notice}{status.total>0&&<> ЖК, КК и фолы — на матч, обе команды. {league==='ucl'?'ЛЧ включает квалификационные матчи. ':''}При N меньше 10 среднее особенно нестабильно.</>}</div>;
}
export function RefereeTableEmpty({group,visibleRows,update}:{visibleRows:number}&Props){
 const status=refereeTableStatus(group,visibleRows,update);
 return <div className="empty"><h3>{status.emptyTitle}</h3><p>{status.emptyDescription}</p></div>;
}
export function RefereeTableFoot({group}:Props){
 const status=refereeTableStatus(group,group?.rows?.length||0);
 return <div className="tableFoot"><span>{status.total?status.total+' записей':'Подтверждённых строк нет'} · {status.checkedAt?'Последнее чтение: ':''}{snapshotDateLabel(status.checkedAt)}</span>{group?.source&&<a href={group.source} target="_blank" rel="noreferrer">Источник ↗</a>}</div>;
}
