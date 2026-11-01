'use client';
import {refereeEvidence} from '../lib/referee-evidence';
const number=(v:any)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ru-RU',{maximumFractionDigits:2}):'—';
export default function RefereeEvidence({match,group,hasHistory=false}:{match:any;group:any;hasHistory?:boolean}){
 const e=refereeEvidence(match,group);
 return <section className="refBehavior" aria-label="Объяснимая оценка арбитра"><h4>Что подтверждают данные</h4>
 <p>Период: <b>{e.season}</b>{!e.seasonConfirmed?' · сезон не подтверждён':''}. Выборка ЖК: <b>{e.n}</b> матчей{e.row?.n!==undefined?` из ${e.row.n} в строке источника`:''}. ЖК / матч: <b>{number(e.row?.yellow)}</b>.</p>
 <p className="definition">Статистика проверена: {e.age===null?'нет корректной даты':new Date(e.checkedAt).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi'})+' · Тбилиси (UTC+4)'}{e.age!==null?` · ${Math.floor(e.age)} дн. назад`:''}. {e.source&&<a href={e.source} target="_blank" rel="noreferrer">Источник статистики ↗</a>} Дата назначения показана отдельно.</p>
 {e.baseline!==null&&<p>Взвешенное среднее доступной таблицы турнира: <b>{number(e.baseline)} ЖК / матч</b> · {e.referees} арбитров, {e.baselineN} наблюдений. Это доступная выборка, не подтверждение полного покрытия лиги; средние источника могут быть округлены.</p>}
 {e.eligible?<p>Данные проходят минимальные проверки для сценарного расчёта. Отличие от таблицы само по себе не доказывает строгость судьи и не предсказывает тотал конкретного матча.</p>:<><b>Недостаточно данных для включения судьи в расчёт</b><ul>{e.reasons.map(s=><li key={s}>{s}</li>)}</ul></>}
 <p>{hasHistory?'Ниже доступен отдельный архив найденных матчей: используйте фильтр турнира и дату среза. Он не является автоматически обновляемой историей.':'Последние отдельные матчи с проверенными карточками для этого арбитра пока недоступны. Среднее не заменяет журнал игр.'}</p>
 <p className="definition">Это объяснение правил и источников, не подключённый ИИ. Сценарная модель не откалибрована; выигрыш не гарантирован.</p></section>;
}
