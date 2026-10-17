export const DRAW_LEAGUES:Record<string, string> = {epl:'АПЛ', ucl:'Лига чемпионов', laliga:'Ла Лига', segunda:'Сегунда', seriea:'Серия А', bundesliga:'Бундеслига', ligue1:'Лига 1', superlig:'Süper Lig', primeira:'Primeira Liga'};
export const DRAW_LIMIT = 6;
export const DRAW_DAYS = 3;
const DAY_MS = 86400000;

type Raw = Record<string, unknown>;
type Fixture = {id:string; league:string; date:string; home:string; away:string; fixturesCheckedAt:string};
type HistoryEvent = {id:string; date:string; opponent:string; goalsFor:number; goalsAgainst:number};
type TeamSample = {id:string; name:string; n:number; goalsFor:number; goalsAgainst:number; oneOne:number; bothScored:number; events:HistoryEvent[]};
export type DrawScenario = {match:Fixture; leagueName:string; season:string; checkedAt:string; fixturesCheckedAt:string; source:string; teams:TeamSample[]; partial:boolean};
export type DrawSearchResult = {from:string; to:string; checkedAt:string; examined:number; scenarios:DrawScenario[]; issues:string[]; skipped:string[]};

const object = (value:unknown):Raw => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {};
const array = (value:unknown):unknown[] => Array.isArray(value) ? value : [];
const text = (value:unknown):string => typeof value === 'string' ? value : '';
const timestamp = (value:unknown):string => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : '';
const goal = (value:unknown):value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const localDate = (value:number) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tbilisi', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(value));

export function evaluateDrawScenario(match:Fixture, value:unknown, now=Date.now()):{scenario?:DrawScenario; reason?:string} {
  const data = object(value);
  if (data.error) return {reason:text(data.error) || 'Источник анализа недоступен'};
  if (data.stale) return {reason:'Источник вернул устаревший сохранённый анализ'};
  if (data.state !== 'pre' || Date.parse(match.date) <= now || /postponed|cancelled|canceled|suspended|abandoned/i.test(text(data.status))) return {reason:'Матч уже начался, перенесён или его статус не подтверждён'};
  if (!timestamp(data.date) || Date.parse(text(data.date)) !== Date.parse(match.date)) return {reason:'Время матча в расписании и анализе различается'};
  const checkedAt = timestamp(data.checkedAt), leagueName = text(data.leagueName), season = text(data.season);
  if (!checkedAt || !leagueName || !season) return {reason:'Не подтверждены время проверки, турнир или сезон истории'};
  const allTeams = array(data.teams).map(object), histories = array(data.history).map(object);
  const teams = ['home', 'away'].map(side => allTeams.find(team => team.side === side));
  if (!teams[0]?.id || !teams[1]?.id || teams[0].id === teams[1].id) return {reason:'Не подтверждены обе команды'};
  const samples = teams.map((team, index) => {
    const id = String(team!.id), history = histories.find(row => String(row.id) === id);
    const unique = new Map<string, HistoryEvent>();
    for (const row of array(history?.events).map(object)) {
      const own = object(row.own).goals, against = object(row.against).goals, eventId = String(row.id ?? ''), date = timestamp(row.date);
      if (!/^\d{5,12}$/.test(eventId) || !date || Date.parse(date) >= Math.min(Date.parse(match.date), now) || !goal(own) || !goal(against)) continue;
      // The analysis endpoint restricts history to this tournament and season.
      // Reject explicit conflicting metadata if a provider includes it.
      if (row.leagueName && row.leagueName !== leagueName || row.season && row.season !== season) continue;
      unique.set(eventId, {id:eventId, date, opponent:text(row.opponent), goalsFor:own, goalsAgainst:against});
    }
    return {id, name:index === 0 ? match.home : match.away, events:[...unique.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 5)};
  });
  const n = Math.min(...samples.map(team => team.events.length));
  if (n < 3) return {reason:`Недостаточно сопоставимых игр: ${samples.map(team => `${team.name} — ${team.events.length}`).join('; ')}; нужно хотя бы по 3`};
  const balanced:TeamSample[] = samples.map(team => {
    const events = team.events.slice(0, n);
    return {...team, events, n, goalsFor:events.reduce((sum, event) => sum + event.goalsFor, 0), goalsAgainst:events.reduce((sum, event) => sum + event.goalsAgainst, 0), oneOne:events.filter(event => event.goalsFor === 1 && event.goalsAgainst === 1).length, bothScored:events.filter(event => event.goalsFor > 0 && event.goalsAgainst > 0).length};
  });
  if (balanced.some(team => team.bothScored === 0) || balanced.every(team => team.oneOne === 0)) return {reason:'Условие отбора не выполнено: обе забивали в истории каждой команды и хотя бы один счёт 1:1'};
  return {scenario:{match, leagueName, season, checkedAt, fixturesCheckedAt:match.fixturesCheckedAt, source:`https://www.espn.com/soccer/match/_/gameId/${match.id}`, teams:balanced, partial:array(data.errors).length > 0}};
}

class RequestFailure extends Error {status:number; constructor(message:string, status=0) {super(message); this.status=status;}}

export async function loadDrawScenarios({league='all', signal, onProgress=() => {}, now=Date.now(), fetcher=fetch}:{league?:string; signal:AbortSignal; onProgress?:(message:string) => void; now?:number; fetcher?:typeof fetch}):Promise<DrawSearchResult> {
  if (league !== 'all' && !DRAW_LEAGUES[league]) throw new Error('Неизвестный турнир');
  const from = localDate(now), dates = Array.from({length:DRAW_DAYS}, (_, index) => localDate(now + index * DAY_MS));
  const result:DrawSearchResult = {from, to:dates[dates.length - 1], checkedAt:'', examined:0, scenarios:[], issues:[], skipped:[]};
  const seen = new Set<string>();
  async function read(url:string) {
    signal.throwIfAborted();
    let response:Response;
    try {response = await fetcher(url, {signal:AbortSignal.any([signal, AbortSignal.timeout(60000)]), cache:'no-store'});}
    catch (reason) {
      signal.throwIfAborted();
      throw new RequestFailure(reason instanceof Error && reason.name === 'TimeoutError' ? 'Источник не ответил за 60 секунд' : 'Ошибка сети: источник недоступен');
    }
    if (!response.ok) throw new RequestFailure(`Источник ответил HTTP ${response.status}`, response.status);
    try {return object(await response.json());} catch {throw new RequestFailure('Источник вернул некорректный ответ');}
  }
  outer: for (const date of dates) {
    onProgress(`Проверяю расписание на ${date}…`);
    let fixtures:Raw;
    try {
      fixtures = await read(`/api/matches?date=${date}&league=${encodeURIComponent(league)}`);
      if (fixtures.error) throw new RequestFailure(text(fixtures.error) || 'Расписание недоступно');
      if (!Array.isArray(fixtures.events) || !timestamp(fixtures.checkedAt)) throw new RequestFailure('У расписания нет подтверждённой даты проверки');
    } catch (reason) {
      signal.throwIfAborted();
      result.issues.push(`${date}: ${reason instanceof Error ? reason.message : 'Не удалось прочитать расписание'}.`);
      // Do not repeat a failing source on subsequent dates or bypass rate limits.
      break;
    }
    const failedLeagues = array(fixtures.errors).map(value => typeof value === 'string' ? value : text(object(value).league));
    if (failedLeagues.length) result.issues.push(`${date}: расписание неполное — ${failedLeagues.map(id => DRAW_LEAGUES[id] || id || 'неизвестный турнир').join(', ')}. Сохранённые игры этих турниров не оцениваются.`);
    const candidates = array(fixtures.events).map(object).filter(event => /^\d{5,12}$/.test(String(event.id)) && text(event.league) in DRAW_LEAGUES && (league === 'all' || event.league === league) && !event.stale && !failedLeagues.includes(text(event.league)) && event.state === 'pre' && timestamp(event.date) && localDate(Date.parse(text(event.date))) === date && Date.parse(text(event.date)) > now && text(event.home) && text(event.away)).sort((a, b) => Date.parse(text(a.date)) - Date.parse(text(b.date)));
    for (const event of candidates) {
      const key = `${event.league}:${event.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const match:Fixture = {id:String(event.id), league:text(event.league), date:text(event.date), home:text(event.home), away:text(event.away), fixturesCheckedAt:text(fixtures.checkedAt)};
      result.examined++;
      onProgress(`Проверяю ${match.home} — ${match.away} (${result.examined} из ${DRAW_LIMIT})…`);
      try {
        const analysis = await read(`/api/analysis?id=${match.id}&league=${encodeURIComponent(match.league)}`);
        const evaluated = evaluateDrawScenario(match, analysis, Math.max(now, Date.now()));
        if (evaluated.scenario) result.scenarios.push(evaluated.scenario);
        else result.skipped.push(`${match.home} — ${match.away}: ${evaluated.reason}.`);
        if (analysis.error || analysis.stale) result.issues.push(`${match.home} — ${match.away}: анализ источника недоступен или устарел.`);
      } catch (reason) {
        signal.throwIfAborted();
        result.issues.push(`${match.home} — ${match.away}: ${reason instanceof Error ? reason.message : 'Анализ недоступен'}.`);
        if (reason instanceof RequestFailure && [0, 401, 403, 429].includes(reason.status)) break outer;
      }
      if (result.scenarios.length >= 3 || result.examined >= DRAW_LIMIT) break outer;
    }
  }
  result.checkedAt = new Date().toISOString();
  return result;
}
