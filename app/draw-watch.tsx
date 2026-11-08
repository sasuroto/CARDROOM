'use client';

import {useEffect, useRef, useState} from 'react';
import {loadDrawScenarios, DRAW_LEAGUES, DRAW_LIMIT, DRAW_DAYS, type DrawSearchResult, type DrawScenario} from '../lib/draw-scenarios';

const time = (value:string) => new Date(value).toLocaleString('ru-RU', {timeZone:'Asia/Tbilisi', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
const day = (value:string) => new Date(value).toLocaleDateString('ru-RU', {timeZone:'Asia/Tbilisi', day:'2-digit', month:'2-digit', year:'numeric'});
const mean = (value:number, n:number) => (value / n).toFixed(2).replace('.', ',');

// Page-owned memory only: no persistent storage, cross-user cache or automatic refresh.
type DrawWatchSnapshot = {result:DrawSearchResult | null; error:string; interrupted:boolean};
export type DrawWatchSession = Map<string, DrawWatchSnapshot>;
const RESTORE_MAX_AGE = 5 * 60 * 1000;
// Reopening the panel cannot renew cached API evidence. Analysis caches last
// five minutes; future-date fixture caches may last thirty minutes.
const scenarioDeadline = (item:DrawScenario) => Math.min(Date.parse(item.match.date), Date.parse(item.checkedAt) + RESTORE_MAX_AGE, Date.parse(item.fixturesCheckedAt) + 30 * 60 * 1000);

export default function DrawWatch({initialLeague='all',locked=false,session:providedSession}:{initialLeague?:string,locked?:boolean,session?:DrawWatchSession}={}) {
  const [localSession] = useState<DrawWatchSession>(() => new Map());
  const session = providedSession || localSession;
  const [league, setLeague] = useState(initialLeague);
  const [result, setResult] = useState<DrawSearchResult | null>(() => session.get(initialLeague)?.result || null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(() => session.get(initialLeague)?.error || '');
  const [interrupted, setInterrupted] = useState(() => session.get(initialLeague)?.interrupted || false);
  const [now, setNow] = useState(() => Date.now());
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => {
    const request = controller.current;
    if (!request) return;
    request.abort();
    controller.current = null;
    const saved = session.get(league);
    session.set(league, {result:saved?.result || null, error:saved?.error || '', interrupted:true});
  }, [league, session]);
  // Invalidate presentation at kickoff or after five minutes, even without navigation.
  // Source dates are never rewritten, and this timer makes no network request.
  useEffect(() => {
    if (!result) return;
    const deadlines = [Date.parse(result.checkedAt) + RESTORE_MAX_AGE, ...result.scenarios.map(scenarioDeadline)].filter(value => value > now);
    if (!deadlines.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...deadlines) - Date.now()));
    return () => clearTimeout(timer);
  }, [result, now]);
  const expired = !!result && (!Number.isFinite(Date.parse(result.checkedAt)) || now - Date.parse(result.checkedAt) >= RESTORE_MAX_AGE || Date.parse(result.checkedAt) > now);
  const scenarios = result && !expired ? result.scenarios.filter(item => scenarioDeadline(item) > now && Date.parse(item.checkedAt) <= now && Date.parse(item.fixturesCheckedAt) <= now) : [];
  const removed = !!result && scenarios.length !== result.scenarios.length;

  async function refresh() {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    setInterrupted(false);
    session.set(league, {result, error:'', interrupted:false});
    setProgress('Проверяю ближайшие даты…');
    try {
      const next = await loadDrawScenarios({league, signal:request.signal, onProgress:message => {if (!request.signal.aborted) setProgress(message);}});
      if (!request.signal.aborted) {
        setNow(Date.now());
        if (result && next.issues.length && !next.scenarios.length) {
          const message = 'Новая проверка неполна. Сохранён предыдущий результат. ' + next.issues.join(' ');
          setError(message);
          session.set(league, {result, error:message, interrupted:false});
        } else {
          setResult(next);
          session.set(league, {result:next, error:'', interrupted:false});
        }
      }
    } catch (reason) {
      if (!request.signal.aborted) {
        const message = reason instanceof Error ? reason.message : 'Подборку не удалось загрузить. Повторите проверку позже.';
        setError(message);
        session.set(league, {result, error:message, interrupted:false});
      }
    } finally {
      if (!request.signal.aborted) {setLoading(false); setProgress('');}
      if (controller.current === request) controller.current = null;
    }
  }

  return <div className="drawWatch">
    <div className="sectionHead"><div><span className="eyebrow">НАБЛЮДЕНИЕ / БЛИЖАЙШИЕ МАТЧИ</span><h2>Сценарий 1:1</h2><p>До трёх пар по подтверждённой истории текущего турнира</p></div></div>
    <p className="notice">Это аналитические сценарии, а не обещание результата. Проверка запускается кнопкой: сегодня и ещё {DRAW_DAYS - 1} дня, максимум {DRAW_LIMIT} ближайших матчей. Время — Тбилиси (Asia/Tbilisi, UTC+4).</p>
    <div className="matchFilters"><label>Турнир<select value={league} disabled={loading||locked} onChange={event => {const next = event.target.value, saved = session.get(next); setLeague(next); setResult(saved?.result || null); setError(saved?.error || ''); setInterrupted(saved?.interrupted || false); setNow(Date.now());}}><option value="all">Все турниры</option>{Object.entries(DRAW_LEAGUES).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label><button className="outline" onClick={refresh} disabled={loading}>{loading ? 'Проверяю…' : 'Обновить подборку'}</button></div>
    {loading && <p role="status" aria-live="polite">{progress}</p>}
    {interrupted && <p className="notice" role="status">Проверка прервана при переходе в другой раздел. Обновите подборку, чтобы повторить её.</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    {!result && !loading && !error && !interrupted && <p className="definition">Нажмите «Обновить подборку», чтобы проверить расписание и историю. Сохранённых неподтверждённых кандидатов здесь нет.</p>}
    {result && <>
      <p className="definition" role="status">Результат проверки от {time(result.checkedAt)} · Тбилиси. Период поиска: {day(result.from + 'T12:00:00+04:00')} — {day(result.to + 'T12:00:00+04:00')}. Изучено матчей: {result.examined}; отобрано: {result.scenarios.length}.</p>
      {result.issues.length > 0 && <div className="notice" role="alert"><b>Ограничения проверки</b><ul>{result.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
      {expired && <p className="notice" role="status">Предыдущая подборка устарела или её дата не подтверждена. Обновите подборку. Дата предыдущей проверки сохранена; кандидаты скрыты.</p>}
      {!expired && removed && <p className="notice" role="status">Часть матчей уже началась или данные проверки устарели; эти кандидаты скрыты. Обновите подборку для новой проверки.</p>}
      {!expired && !removed && !result.scenarios.length && <div className="todayEmpty"><h3>Подтверждённой подборки пока нет</h3><p>В проверенной части расписания не нашлось пар с достаточной сопоставимой историей и признаками сценария 1:1. Это не означает, что таких матчей нет в других датах или недоступных источниках.</p></div>}
      <div className="drawGrid">{scenarios.map((scenario, index) => <article className="drawCard" key={scenario.match.id}>
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
