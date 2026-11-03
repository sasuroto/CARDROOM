'use client';
import {dotSelection,dotFresh,dotAvailability,dotLineupsConfirmed} from '../lib/dot-predict';
import {refereeEvidence} from '../lib/referee-evidence';
import {readableScenario} from '../lib/readable-markets';
import {percent} from '../lib/probability-format';
const stamp=(value:string)=>new Date(value).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',year:'numeric',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const num=(value:number)=>value.toFixed(1).replace('.',',');
export default function DotPredict({match,analysis,markets,data,context,error,loading,now}:{match:any;analysis:any;markets:any[];data:any;context:any;error:string;loading:boolean;now:number}){
 const pre=now>0&&analysis?.state==='pre'&&match.state!=='in'&&match.state!=='post'&&Date.parse(match.date)>now;
 const fresh=dotFresh(match,analysis,error,now),ref=refereeEvidence(match,data.refereesByLeague?.[match.league],now);
 const picks=dotSelection(markets,{pre,fresh:fresh&&!loading,refereeEligible:ref.eligible,now,kickoff:Date.parse(match.date)});
 const notices=dotAvailability(context,match,now);
 const lineups=!loading&&dotLineupsConfirmed(match,analysis,error,now);
 return <section className="dotPredict" aria-label="DOT Predict">
  <header><div><span className="eyebrow">DOT / MATCH INTELLIGENCE</span><h3>DOT Predict</h3></div><span className="dotTag">Статистическая подборка · без AI API</span></header>
  <p>До трёх сценариев из разных категорий. Это не независимые события и не готовый экспресс.</p>
  {picks.length>0?<div className="dotGrid">{picks.map(m=><article key={m.id}>
   <div className="dotScore"><strong>{percent(m.sensitivity.low)}–{percent(m.sensitivity.high)}</strong><span>Чувствительность расчёта<br/>Не доверительный интервал</span></div>
   <h4>{readableScenario(m,match.home,match.away)}</h4>
   <p><b>Основание:</b> {match.home}: N={m.param.nH}; {match.away}: N={m.param.nA}. {m.param.basis}.</p>
   <p>Базовая оценка: {percent(m.p)}. Диапазон при изменении средних на ±20%; модель не откалибрована.</p>
   <p>Модельное среднее: {['home','away'].includes(m.metric)?num(m.metric==='home'?m.param.homeMean:m.param.awayMean):num(m.param.mean)}. Это расчёт по истории, не обещание результата.</p>
   <p><b>Самый ранний срез исходных данных:</b> {stamp(new Date(Math.min(...m.param.evidence.map((e:any)=>Date.parse(e.checkedAt)))).toISOString())} · Тбилиси.</p>
   <details><summary>Источники и даты расчёта</summary><ul>{m.param.evidence.map((e:any,i:number)=><li key={e.source+i}><a href={e.source} target="_blank" rel="noreferrer">{e.label} ↗</a><br/>Проверено {stamp(e.checkedAt)} · Тбилиси</li>)}</ul></details>
  </article>)}</div>:<p className="dotNotice" role="status">{loading?'Проверяю данные для подборки…':!pre?'Предматчевая подборка недоступна: матч начался, завершён или его статус не подтверждён.':!fresh?'Подборка приостановлена: данные устарели, неполны или не соответствуют матчу.':'Недостаточно подтверждённых данных для отбора сценариев.'}</p>}
  {picks.length>0&&picks.length<3&&<p className="dotNotice">Подтверждений достаточно для {picks.length} из 3 категорий. Остальные не заполняем предположениями.</p>}
  <div className="dotContext"><h4>Что может изменить вывод</h4>
   <ul><li><b>Составы:</b> {lineups?'Источник передал стартовые составы обеих команд.':'Стартовые составы обеих команд ещё не подтверждены.'} Кадровые изменения не включены в проценты модели.</li>
   <li><b>Арбитр:</b> {ref.eligible?'Пригодная статистика арбитра доступна для модели жёлтых карточек.': 'Карточки и фолы исключены из DOT: '+ref.reasons.join(' ')} На фолы поправка арбитра не применяется; требование к арбитру — дополнительный фильтр допуска, а не поправка расчёта.</li>
   <li><b>Погода и поле:</b> прогноз указан в разделе погоды выше. Погодная поправка к вероятностям не рассчитана; состояние газона не подтверждено.</li>
   <li><b>Новости и эмоциональный фон:</b> автоматическая проверка новостей не подключена. Сообщения клубов обновляются вручную; после 24 часов без проверки скрываются. Это не означает отсутствия важных событий. Настроение игроков, последствия трагедий и слухи не выводятся из статистики и не меняют проценты.</li>
   <li><b>Мотивация и нагрузка:</b> турнирные задачи, поездки, отдых и возможная ротация не оценены этой моделью.</li></ul>
   {notices.map((a:any,i:number)=><div className="dotNotice" key={a.source+i}><b>Подтверждённое сообщение клуба · {a.team}</b><p>{a.text}</p><small>Публикация {a.publishedDate} · проверено {stamp(a.checkedAt)} · Тбилиси. </small><a href={a.source} target="_blank" rel="noreferrer">Источник ↗</a><p>Возможное влияние на игру — гипотеза; числовая поправка не применяется. Заявка не равна стартовому составу.</p></div>)}
  </div>
  <details><summary>Как DOT выбирает сценарии</summary><p>Минимум 10 матчей у каждой команды для конкретного показателя. Нижняя граница чувствительности расчёта должна быть не ниже 65%. Это условный фильтр отбора, не доказанная надёжность. Исход фиксируется до изменения средних; для исхода матча и «обе забьют» средние обеих команд меняются независимо. Не более одного сценария из групп: атака, угловые, дисциплина. Категории могут быть связаны между собой.</p><p>Диапазон ±20% не исправляет избыточный разброс карточек, фолов и угловых и не заменяет калибровку. Ранжирование по нижней границе часто отдаёт приоритет очевидным событиям; это не поиск выгодных коэффициентов. Минимум 10 матчей также не гарантирует точность.</p><p>Сводка матча должна быть не старше 15 минут; исходные протоколы истории — 24 часов, сезонные таблицы и статистика арбитра — 7 дней. Даты указаны отдельно у каждого сценария. При неизвестных датах, ошибках, устаревании или начале матча подборка скрывается.</p><p>Модель Пуассона не откалибрована; качество данных и вероятность — разные вещи. Разные соперники ограничивают вывод. Без коэффициентов выгодность ставки не определяется. Допустимый итог — пропустить матч.</p></details>
  <footer>{fresh?'Проверка сводки матча: '+stamp(analysis.checkedAt)+' · Тбилиси (UTC+4). Это не дата всех исходных таблиц.':'Актуальность сводки матча не подтверждена.'} Новостной контекст не проверен. Не гарантия выигрыша.</footer>
 </section>;
}
