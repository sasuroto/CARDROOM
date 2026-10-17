'use client';

import {useEffect, useRef, useState} from 'react';
import {loadDrawScenarios, DRAW_LEAGUES, DRAW_LIMIT, DRAW_DAYS, type DrawSearchResult} from '../lib/draw-scenarios';

const time = (value:string) => new Date(value).toLocaleString('ru-RU', {timeZone:'Asia/Tbilisi', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
const day = (value:string) => new Date(value).toLocaleDateString('ru-RU', {timeZone:'Asia/Tbilisi', day:'2-digit', month:'2-digit', year:'numeric'});
const mean = (value:number, n:number) => (value / n).toFixed(2).replace('.', ',');

export default function DrawWatch({initialLeague='all',locked=false}:{initialLeague?:string,locked?:boolean}={}) {
  const [league, setLeague] = useState(initialLeague);
  const [result, setResult] = useState<DrawSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function refresh() {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setResult(null);
    setError('');
    setProgress('Проверяю ближайшие даты…');
    try {
      const next = await loadDrawScenarios({league, signal:request.signal, onProgress:setProgress});
      if (!request.signal.aborted) setResult(next);
    } catch (reason) {
      if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : 'Подборку не удалось загрузить. Повторите проверку позже.');
    } finally {
      if (!request.signal.aborted) {setLoading(false); setProgress('');}
      controller.current = null;
    }
  }

  return <div className="drawWatch">
    <div className="sectionHead"><div><span className="eyebrow">НАБЛЮДЕНИЕ / БЛИЖАЙШИЕ МАТЧИ</span><h2>Сценарий 1:1</h2><p>До трёх пар по подтверждённой истории текущего турнира</p></div></div>
    <p className="notice">Это аналитические сценарии, а не обещание результата. Проверка запускается кнопкой: сегодня и ещё {DRAW_DAYS - 1} дня, максимум {DRAW_LIMIT} ближайших матчей. Время — Тбилиси (Asia/Tbilisi, UTC+4).</p>
    <div className="matchFilters"><label>Турнир<select value={league} disabled={loading||locked} onChange={event => {setLeague(event.target.value); setResult(null); setError('');}}><option value="all">Все турниры</option>{Object.entries(DRAW_LEAGUES).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label><button className="outline" onClick={refresh} disabled={loading}>{loading ? 'Проверяю…' : 'Обновить подборку'}</button></div>
    {loading && <p role="status" aria-live="polite">{progress}</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    {!result && !loading && !error && <p className="definition">Нажмите «Обновить подборку», чтобы проверить расписание и историю. Сохранённых неподтверждённых кандидатов здесь нет.</p>}
    {result && <>
      <p className="definition" role="status">Проверка завершена {time(result.checkedAt)} · Тбилиси. Период поиска: {day(result.from + 'T12:00:00+04:00')} — {day(result.to + 'T12:00:00+04:00')}. Изучено матчей: {result.examined}; отобрано: {result.scenarios.length}.</p>
      {result.issues.length > 0 && <div className="notice" role="alert"><b>Ограничения проверки</b><ul>{result.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
      {!result.scenarios.length && <div className="todayEmpty"><h3>Подтверждённой подборки пока нет</h3><p>В проверенной части расписания не нашлось пар с достаточной сопоставимой историей и признаками сценария 1:1. Это не означает, что таких матчей нет в других датах или недоступных источниках.</p></div>}
      <div className="drawGrid">{result.scenarios.map((scenario, index) => <article className="drawCard" key={scenario.match.id}>
        <div className="drawTop"><span>{String(index + 1).padStart(2, '0')} / ПО ВРЕМЕНИ НАЧАЛА</span><b aria-label="Сценарий: один — один">1:1</b></div>
        <p>{DRAW_LEAGUES[scenario.match.league]} · {time(scenario.match.date)} · Тбилиси</p><h3>{scenario.match.home} — {scenario.match.away}</h3>
        <p>{scenario.leagueName} · сезон {scenario.season}. Сопоставлены последние {scenario.teams[0].n} доступных завершённых матчей каждой команды в этом турнире.</p>
        <div className="tableWrap"><table><thead><tr><th>Команда</th><th>Матчи</th><th>Голы</th><th>Забивает / пропускает*</th><th>Счёт 1:1</th></tr></thead><tbody>{scenario.teams.map(team => <tr key={team.id}><td><b>{team.name}</b></td><td>{team.n}</td><td>{team.goalsFor}:{team.goalsAgainst}</td><td>{mean(team.goalsFor, team.n)} / {mean(team.goalsAgainst, team.n)}</td><td>{team.oneOne} из {team.n}</td></tr>)}</tbody></table></div>
        <small>* Средние за матч в указанной выборке, не прогноз голов следующей игры.</small>
        <h4>Почему в подборке</h4><p>У обеих команд есть матчи, где забивали обе стороны: {scenario.teams.map(team => `${team.name} — ${team.bothScored} из ${team.n}`).join('; ')}. В истории хотя бы одной команды встречался счёт 1:1. Это основание рассмотреть сценарий, а не оценка его вероятности.</p>
        <h4>Что мешает сценарию</h4><p>Другие счета в выборках: {scenario.teams.map(team => `${team.name} — ${team.n - team.oneOne} из ${team.n}`).join('; ')}. Истории могут включать общую очную встречу и не являются независимыми наблюдениями. Не учтены сила соперников, отдельная домашняя и выездная форма, травмы и составы на эту игру.</p>
        {scenario.partial && <p className="notice">Часть истории источник не передал. Ниже показаны только доступные матчи; выборка может быть неполной.</p>}
        <details><summary>Выборка, даты и источники</summary><p>Статистика прочитана {time(scenario.checkedAt)}; расписание — {time(scenario.fixturesCheckedAt)}. Это время проверки API, а не гарантия отсутствия задержки поставщика. Счета и статистика: ESPN.</p>
          {scenario.teams.map(team => <section key={team.id}><h4>{team.name} · {day(team.events[team.events.length - 1].date)} — {day(team.events[0].date)}</h4><ul>{team.events.map(event => <li key={event.id}><a href={`https://www.espn.com/soccer/match/_/gameId/${event.id}`} target="_blank" rel="noreferrer">{day(event.date)} · {event.opponent || 'Соперник не указан'} · {event.goalsFor}:{event.goalsAgainst} ↗</a></li>)}</ul></section>)}
          <p><a href={scenario.source} target="_blank" rel="noreferrer">ESPN · предстоящий матч ↗</a></p>
        </details>
      </article>)}</div>
      {result.skipped.length > 0 && <details className="allScenarios"><summary>Почему другие проверенные пары не вошли</summary><ul>{result.skipped.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>}
    </>}
    <details className="allScenarios"><summary>Как формируется подборка</summary><p>Из расписания берём будущие матчи и проверяем их последовательно, ближайшие первыми. Для каждой команды нужно не менее трёх завершённых игр текущего сезона в том же турнире. Длины выборок выравниваются по меньшей: от трёх до пяти последних доступных игр. Отсутствующие голы не заменяются нулями.</p><p>Прозрачное условие отбора: в выборке каждой команды хотя бы один матч с голами обеих сторон; хотя бы у одной команды есть 1:1. Это исследовательский фильтр, не проверенная прогнозная модель. Проценты и рейтинг надёжности не рассчитываются. При трёх найденных парах или после {DRAW_LIMIT} проверок поиск останавливается; все остальные матчи не оценены.</p><p>Сохранённые устаревшие ответы и уже начавшиеся матчи не используются. Источник может задерживать данные. При недоступности отдельных турниров подборка остаётся неполной; автоматических повторов запросов нет. Обновляйте её перед матчами.</p></details>
  </div>;
}
