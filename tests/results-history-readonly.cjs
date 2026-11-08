/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node regression harness uses CommonJS. */
// Existing schema-1 payloads, seeded only in isolated SQLite. No live DB or provider.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ts = require('typescript'), Module = require('node:module'), { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const originalTs = require.extensions['.ts'], originalLoad = Module._load, originalFetch = global.fetch;
const env = {}, sql = new DatabaseSync(':memory:');
let checks = 0, writes = 0, reads = 0, fetches = 0;
const check = (ok, message) => { assert.ok(ok, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const hash = value => createHash('sha256').update(value).digest('hex');

(async () => {
  try {
    require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, f);
    Module._load = function (id, ...args) { return id === 'cloudflare:workers' ? { env } : originalLoad.call(this, id, ...args); };
    global.fetch = () => { fetches++; throw Error('Historical journal reads must not fetch'); };
    const M = require('../lib/results-model.ts'), J = require('../lib/results-journal.ts'), route = require('../app/api/results/route.ts');
    sql.exec(fs.readFileSync(path.join(root, 'drizzle/0000_tough_mathemanic.sql'), 'utf8'));
    const kickoff = '2026-11-06T09:00:00.000Z', beforeKickoff = '2026-11-06T08:00:00.000Z';
    const checkedAt = '2026-11-06T12:00:00.000Z', older = '2026-11-06T11:59:00.000Z';
    const fixture = { id: '123456', league: 'epl', date: kickoff, home: 'Synthetic Home', away: 'Synthetic Away', state: 'pre' };
    const source = 'https://www.espn.com/soccer/match/_/gameId/123456';
    const analysis = {
      date: kickoff, state: 'pre', statusName: 'STATUS_SCHEDULED', season: '2026/27', checkedAt: beforeKickoff, source,
      teams: [{ id: '1', name: fixture.home, side: 'home' }, { id: '2', name: fixture.away, side: 'away' }],
      history: ['1', '2'].map(id => ({ id, name: id, events: Array.from({ length: 4 }, (_, i) => ({
        date: new Date(Date.parse(beforeKickoff) - (i + 1) * 86400000).toISOString(),
        source: 'https://www.espn.com/soccer/match/_/gameId/' + (200000 + i), checkedAt: beforeKickoff,
        own: { goals: 2, corners: 4, yellow: 0 }, against: { goals: 1, corners: 5, yellow: 0 },
      })) })),
    };
    const forecast = M.forecastSnapshot(fixture, analysis, { leagues: [{ id: 'epl' }] }, Date.parse(beforeKickoff));
    check(forecast?.schemaVersion === 1 && forecast.picks.length > 0, 'forecast uses the current schema-1 builder');
    // Fixed synthetic selections make the expected denominators independent of the model fit.
    forecast.picks = [
      { metric: 'goals', choice: 'over', line: 2.5, probability: .7, dotSelected: true },
      { metric: 'result', choice: 'away', probability: .4, dotSelected: false },
      { metric: 'yellow', choice: 'under', line: 4.5, probability: .8, dotSelected: true },
    ];
    const input = { ...fixture, state: 'post', statusName: 'STATUS_FULL_TIME', statusDetail: 'FT', period: 2,
      homeId: '1', awayId: '2', checkedAt, source, homeScore: '2', awayScore: '1',
      teams: analysis.teams.map((t, i) => ({ ...t, score: String(2 - i), stats: { yellow: 0 } })),
    };
    const score = M.resultObservation(input, 'score', Date.parse(checkedAt));
    const detail = M.resultObservation(input, 'analysis', Date.parse(checkedAt));
    check(score?.schemaVersion === 1 && detail?.schemaVersion === 1, 'observations use the unchanged schema-1 normalizer');
    const cases = [
      { name: 'valid', observations: [detail], states: ['hit', 'miss', 'hit'] },
      { name: 'null-period', observations: [{ ...detail, period: null }], states: ['excluded', 'excluded', 'excluded'] },
      { name: 'omitted-period', observations: [{ ...detail, period: undefined }], states: ['excluded', 'excluded', 'excluded'] },
      { name: 'string-period', observations: [{ ...detail, period: '2' }], states: ['excluded', 'excluded', 'excluded'] },
      { name: 'missing-ids', observations: [{ ...detail, homeId: null, awayId: null }], states: ['excluded', 'excluded', 'excluded'] },
      { name: 'omitted-id', observations: [{ ...detail, homeId: undefined }], states: ['excluded', 'excluded', 'excluded'] },
      { name: 'bad-older-detail-period', observations: [{ ...detail, period: null, checkedAt: older }, score], states: ['hit', 'miss', 'unverified'] },
      { name: 'bad-older-detail-id', observations: [{ ...detail, homeId: null, checkedAt: older }, score], states: ['hit', 'miss', 'unverified'] },
      { name: 'valid-score-only', observations: [score], states: ['hit', 'miss', 'unverified'] },
      { name: 'newer-incomplete-score', observations: [{ ...score, checkedAt: older }, { ...score, period: null }], states: ['excluded', 'excluded', 'excluded'] },
      { name: 'newer-confirmed-score', observations: [{ ...score, period: null, checkedAt: older }, score], states: ['hit', 'miss', 'unverified'] },
      { name: 'valid-numeric-ids', observations: [{ ...detail, statusName: 'STATUS_FINAL', homeId: 1, awayId: 2 }], states: ['hit', 'miss', 'hit'] },
      { name: 'pending', observations: [], states: ['pending', 'pending', 'pending'] },
      { name: 'corrected-score-disagrees', observations: [{ ...detail, checkedAt: older }, { ...score, homeStats: { ...score.homeStats, goals: 3 } }], states: ['hit', 'miss', 'unverified'] },
    ];
    const persisted = new Map();
    for (const [i, item] of cases.entries()) {
      const id = String(123456 + i), key = 'epl:' + id;
      const f = { ...forecast, id, source: source.replace('123456', id) };
      // Preserve exact serialized bytes, including whitespace, across all reads.
      const payload = JSON.stringify(f, null, 2);
      sql.prepare('INSERT INTO journal_forecasts VALUES (?,?,?,?,?)').run(key, 'epl', '2026-11-06', beforeKickoff, payload);
      const observations = item.observations.map(o => ({ ...o, id, source: source.replace('123456', id) }));
      for (const observation of observations) {
        const { checkedAt: at, ...facts } = observation, digest = hash(JSON.stringify(facts));
        sql.prepare('INSERT INTO journal_observations VALUES (?,?,?,?,?,?,?,?,?)').run(
          hash(key + observation.kind + at + digest), key, 'epl', '2026-11-06', observation.kind,
          at, at, digest, JSON.stringify(observation, null, 2),
        );
      }
      persisted.set(key, { item, f, observations });
    }
    const snapshot = () => JSON.stringify({
      forecasts: sql.prepare('SELECT * FROM journal_forecasts ORDER BY match_key').all(),
      observations: sql.prepare('SELECT * FROM journal_observations ORDER BY id').all(),
      schema: sql.prepare('SELECT * FROM sqlite_master ORDER BY name').all(),
    });
    const before = snapshot(), changes = sql.prepare('SELECT total_changes() n').get().n;
    const db = { prepare(query) {
      if (!/^SELECT\s/i.test(query.trim())) { writes++; throw Error('Only SELECT allowed during replay'); }
      reads++;
      const statement = sql.prepare(query);
      const methods = args => ({
        first: async () => statement.get(...args) || null,
        all: async () => ({ results: statement.all(...args) }),
        run: async () => { writes++; throw Error('Writes forbidden during replay'); },
      });
      return { ...methods([]), bind: (...args) => methods(args) };
    } };
    sql.exec('PRAGMA query_only = ON');
    env.DB = db;
    const period = { from: '2026-11-06', to: '2026-11-06', league: 'all' };
    const report = await J.readJournal(db, period);
    equal([report.schemaVersion, report.matches, report.withForecast], [1, cases.length, cases.length], 'no schema expansion or historical loss');
    equal(report.withResult, cases.length - 1, 'invalid evidence is retained, not deleted');
    equal(report.firstRecordedAt, beforeKickoff, 'original capture start preserved');
    check(!report.truncated && report.coverage === 'observed-only', 'original bounded coverage contract');
    for (const row of report.rows) {
      const saved = persisted.get(row.key), latest = saved.observations.at(-1);
      equal(row.picks.map(p => p.outcome.state), saved.item.states, saved.item.name + ': exact replay outcomes');
      equal(row.picks.map(p => { const original = { ...p }; delete original.outcome; return original; }), saved.f.picks, saved.item.name + ': original picks and probabilities');
      equal(row.committedAt, beforeKickoff, saved.item.name + ': original commit date');
      equal(row.result, latest ? JSON.parse(JSON.stringify(latest)) : null, saved.item.name + ': original result payload, no normalization or repair');
      equal(row.corrections, saved.item.name.startsWith('newer-') ? 1 : 0, saved.item.name + ': all revision counts retained');
    }
    // Explicit totals for this synthetic sample, not a production estimate.
    equal([report.totals.predictions, report.totals.settled, report.totals.hits, report.totals.misses,
      report.totals.excluded, report.totals.unverified, report.totals.pending], [42, 16, 9, 7, 18, 5, 3], 'mixed historical denominators');
    equal(report.totals.hitRate, 9 / 16, 'accuracy includes only 16 confirmed picks');
    check(Math.abs(report.totals.brier - (7 * .09 + 7 * .16 + 2 * .04) / 16) < 1e-12, 'Brier excludes every incomplete pick');
    equal(report.totals.byMetric, [
      { metric: 'goals', settled: 7, hits: 7, hitRate: 1 },
      { metric: 'result', settled: 7, hits: 0, hitRate: 0 },
      { metric: 'yellow', settled: 2, hits: 2, hitRate: 1 },
    ], 'per-metric denominators are independently correct');
    equal([report.dot.predictions, report.dot.settled, report.dot.hits, report.dot.misses,
      report.dot.excluded, report.dot.unverified, report.dot.pending], [28, 9, 9, 0, 12, 5, 2], 'DOT excludes non-DOT and incomplete picks');
    check(Math.abs(report.dot.brier - (7 * .09 + 2 * .04) / 9) < 1e-12, 'DOT Brier denominator');
    equal(await J.readJournal(db, period), report, 'repeated reads are stable');
    const response = await route.GET(new Request('https://local.invalid/api/results?from=2026-11-06&to=2026-11-06'));
    equal(response.status, 200, 'actual GET handler reads synthetic history');
    equal(response.headers.get('Cache-Control'), 'no-store', 'read API retains no-store');
    equal(await response.json(), report, 'API uses the same corrected read-time scoring');
    equal(snapshot(), before, 'payload bytes, digests, row IDs, dates, all revisions and schema unchanged');
    equal(sql.prepare('SELECT total_changes() n').get().n, changes, 'no SQL writes during any read');
    equal([writes, fetches], [0, 0], 'no write attempt or provider request');
    check(reads > 0, 'actual SQLite SELECTs exercised');
    console.log(`PASS ${checks} schema-1 historical read-only checks; ${cases.length} synthetic fixtures, no external traffic.`);
  } finally {
    sql.close();
    Module._load = originalLoad;
    if (originalTs) require.extensions['.ts'] = originalTs;
    else delete require.extensions['.ts'];
    global.fetch = originalFetch;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
