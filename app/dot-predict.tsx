'use client';
import {dotSelection,dotFresh,dotAvailability} from '../lib/dot-predict';
import {refereeEvidence} from '../lib/referee-evidence';
import {readableScenario} from '../lib/readable-markets';
import './dot-predict.css';
const stamp=(value:string)=>new Date(value).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const num=(value:number)=>value.toFixed(1).replace('.',',');
export default function DotPredict({match,analysis,markets,data,context,error,loading}:{match:any;analysis:any;markets:any[];data:any;context:any;error:string;loading:boolean}){
 const now=Date.now(),pre=analysis?.state==='pre'&&Date.parse(match.date)>now;
 const fresh=dotFresh(match,analysis,error,now),ref=refereeEvidence(match,data.refereesByLeague?.[match.league],now);
 const picks=dotSelection(markets,{pre,fresh:fresh&&!loading,refereeEligible:ref.eligible});
 const notices=dotAvailability(context,match,now);
 const lineups=(analysis?.lineups||[]).filter((t:any)=>t.players?.filter((p:any)=>p.starter===true).length>=11).length>=2;
 return <section className="dotPredict" aria-label="DOT Predict">
  <header><div><span className="eyebrow">DOT / MATCH INTELLIGENCE</span><h3>DOT Predict</h3></div><span className="dotTag">Статистическая подборка · без AI API</span></header>
  <p>До трёх сценариев из разных категорий. Это не независимые события и не готовый экспресс.</p>
  {picks.length>0?<div className="dotGrid">{picks.map(m=><article key={m.id}>
   <div className="dotScore"><strong>{Math.round(m.p*100)}%</strong><span>Оценка модели<br/>{m.n<10?'Малая выборка':'Не откалибрована'}</span></div>
   <h4>{readableScenario(m,match.home,match.away)}</h4>
   <p><b>Основание:</b> {match.home}: N={m.param.nH}; {match.away}: N={m.param.nA}. {m.param.basis}.</p>
   <p>Модельное среднее: {['home','away'].includes(m.metric)?num(m.metric==='home'?m.param.homeMean:m.param.awayMean):num(m.param.mean)}. Это расчёт по истории, не обещание результата.</p>
   <a href={m.param.source} target="_blank" rel="noreferrer">Источник статистики ↗</a>
  </article>)}</div>:<p className="dotNotice" role="status">{loading?'Проверяю данные для подборки…':!pre?'Предматчевая подборка недоступна: матч начался, завершён или его статус не подтверждён.':!fresh?'Подборка приостановлена: данные устарели, неполны или не соответствуют матчу.':'Недостаточно подтверждённых данных для отбора сценариев.'}</p>}
  {picks.length>0&&picks.length<3&&<p className="dotNotice">Подтверждений достаточно для {picks.length} из 3 категорий. Остальные не заполняем предположениями.</p>}
  <div className="dotContext"><h4>Что может изменить вывод</h4>
   <ul><li><b>Составы:</b> {lineups?'Источник передал стартовые составы обеих команд.':'Стартовые составы обеих команд ещё не подтверждены.'} Кадровые изменения не включены в проценты модели.</li>
   <li><b>Арбитр:</b> {ref.eligible?'Пригодная статистика арбитра учтена в модели жёлтых карточек.': 'Карточки и фолы исключены из DOT: '+ref.reasons.join(' ')}</li>
   <li><b>Погода и поле:</b> прогноз указан в разделе погоды выше. Погодная поправка к вероятностям не рассчитана; состояние газона не подтверждено.</li>
   <li><b>Новости и эмоциональный фон:</b> автоматическая проверка новостей не подключена. Это не означает отсутствия важных событий. Настроение игроков, последствия трагедий и слухи не выводятся из статистики и не меняют проценты.</li>
   <li><b>Мотивация и нагрузка:</b> турнирные задачи, поездки, отдых и возможная ротация не оценены этой моделью.</li></ul>
   {notices.map((a:any,i:number)=><div className="dotNotice" key={a.source+i}><b>Подтверждённое сообщение клуба · {a.team}</b><p>{a.text}</p><small>Публикация {a.publishedDate} · проверено {stamp(a.checkedAt)} · Тбилиси. </small><a href={a.source} target="_blank" rel="noreferrer">Источник ↗</a><p>Возможное влияние на игру — гипотеза; числовая поправка не применяется. Заявка не равна стартовому составу.</p></div>)}
  </div>
  <details><summary>Как DOT выбирает сценарии</summary><p>Из основных линий CARDROOM: минимум 3 игры у каждой команды, оценка модели от 65%, не более одного сценария из каждой группы — атака, угловые, дисциплина. Порог 65% — правило отбора, не доказанная надёжность. Дисциплина требует пригодных данных арбитра. При ошибках или срезе старше 15 минут подборка скрывается. Категории могут быть связаны между собой.</p><p>Модель Пуассона не откалибрована; качество данных и вероятность — разные вещи. Небольшая выборка и разные соперники ограничивают вывод. Без коэффициентов выгодность ставки не определяется. Допустимый итог — пропустить матч.</p></details>
  <footer>{Number.isFinite(Date.parse(analysis?.checkedAt))?'Срез статистики: '+stamp(analysis.checkedAt)+' · Тбилиси (UTC+4).':'Дата статистики не подтверждена.'} Новостной контекст не проверен. Не гарантия выигрыша.</footer>
 </section>;
}
