export const SAMPLE_METRICS = [
  ['goals', 'Голы'], ['yellow', 'Жёлтые карточки'], ['red', 'Красные карточки'],
  ['corners', 'Угловые'], ['shots', 'Удары'], ['target', 'Удары в створ'],
  ['fouls', 'Фолы'], ['offsides', 'Офсайды'], ['saves', 'Сейвы'], ['possession', 'Владение, %'],
] as const;
export type SampleMetric = typeof SAMPLE_METRICS[number][0];
export type SampleSize = 5 | 10 | 20 | 'all';
export type SampleVenue = 'all' | 'home' | 'away';
export type SampleEvent = {
  id: string; date: string; leagueName?: string; season?: string; source?: string;
  opponent?: string; homeAway?: 'home' | 'away' | null;
  own?: Partial<Record<SampleMetric, number | null>>;
  against?: Partial<Record<SampleMetric, number | null>>;
};
export type SampleScope = {before: string; leagueName?: string; season?: string};
const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Venue is filtered before the last-N cutoff. Missing venue is never inferred. */
export function selectSample(events: SampleEvent[] | undefined, size: SampleSize, venue: SampleVenue, scope: SampleScope): SampleEvent[] {
  const cutoff = Date.parse(scope.before);
  if (!Number.isFinite(cutoff)) return [];
  const unique = new Map<string, SampleEvent>();
  for (const event of events || []) {
    if (!event || event.id == null || String(event.id) === '') continue;
    const date = Date.parse(event.date);
    if (!Number.isFinite(date) || date >= cutoff) continue;
    if (scope.leagueName && event.leagueName !== scope.leagueName) continue;
    if (scope.season && event.season !== scope.season) continue;
    if (venue !== 'all' && event.homeAway !== venue) continue;
    if (!unique.has(String(event.id))) unique.set(String(event.id), event);
  }
  const sorted = [...unique.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || String(a.id).localeCompare(String(b.id)));
  return size === 'all' ? sorted : sorted.slice(0, size);
}

export function sampleMean(events: SampleEvent[], metric: SampleMetric, side: 'own' | 'against') {
  const values = events.map(event => event[side]?.[metric]).filter(valid);
  return {n: values.length, value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null};
}

export const SAMPLE_FREQUENCIES = [
  ['goals25', '3 и более гола', 'Больше 2,5: суммарно от трёх голов.'],
  ['btts', 'Обе команды забили', 'Хотя бы один гол у каждой команды.'],
  ['corners95', '10 и более угловых', 'Больше 9,5: суммарно от десяти угловых.'],
  ['yellow45', '5 и более жёлтых', 'Больше 4,5: суммарно от пяти жёлтых карточек.'],
] as const;
export type SampleFrequency = typeof SAMPLE_FREQUENCIES[number][0];
export function sampleFrequency(events: SampleEvent[], kind: SampleFrequency) {
  const metric = kind === 'corners95' ? 'corners' : kind === 'yellow45' ? 'yellow' : 'goals';
  let n = 0, count = 0;
  for (const event of events) {
    const own = event.own?.[metric], against = event.against?.[metric];
    if (!valid(own) || !valid(against)) continue;
    n++;
    if (kind === 'btts' ? own > 0 && against > 0 : own + against > (kind === 'goals25' ? 2.5 : kind === 'corners95' ? 9.5 : 4.5)) count++;
  }
  return {n, count, percent: n ? count / n * 100 : null};
}

export function samplePeriod(events: SampleEvent[]) {
  const dates = events.map(event => event.date).filter(date => Number.isFinite(Date.parse(date))).sort((a, b) => Date.parse(a) - Date.parse(b));
  return dates.length ? {from: dates[0], to: dates[dates.length - 1]} : null;
}

/** A shared provider match ID in two verified team histories proves the matchup.
 * Requiring both scores and their inverse avoids treating conflicting snapshots as H2H.
 */
export function sharedSampleMatches(homeId: unknown, awayId: unknown, home: SampleEvent[], away: SampleEvent[]) {
  if (homeId == null || awayId == null || String(homeId) === String(awayId)) return [];
  const other = new Map(away.map(event => [String(event.id), event]));
  return home.filter(event => {
    const match = other.get(String(event.id));
    return match && !!event.leagueName && !!event.season && Date.parse(event.date) === Date.parse(match.date) && event.leagueName === match.leagueName && event.season === match.season &&
      valid(event.own?.goals) && valid(event.against?.goals) && event.own?.goals === match.against?.goals && event.against?.goals === match.own?.goals;
  });
}
