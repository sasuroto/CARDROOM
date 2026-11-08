/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node regression harness uses CommonJS. */
// Adapted from PR #10 at 22158260b86efa3b35ddde08afbf208f5f9ff620 for schema 1.
// Actual-source regressions only: no candidate source patch or production data.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let passed = 0, failed = 0, errors = 0;
const originalTs = require.extensions['.ts'], originalFetch = global.fetch;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) {
    if (error instanceof assert.AssertionError) {
      failed++; console.error(`FAIL ${name}: ${error.message}`);
    } else {
      errors++; console.error(`ERROR ${name}: ${error.stack || error}`);
    }
  }
}
try {
  if (process.argv.length > 2) throw Error('No arguments supported: tests must run the actual source');
  const ts = require('typescript');
  const filename = path.resolve(__dirname, '../lib/results-model.ts');
  const source = fs.readFileSync(filename, 'utf8');
  require.extensions['.ts'] = (m, f) => {
    const input = fs.readFileSync(f, 'utf8');
    const compiled = ts.transpileModule(input, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    if (compiled.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw Error(`TypeScript transpilation failed: ${f}`);
    m._compile(compiled.outputText, f);
  };
  global.fetch = () => { throw Error('Network forbidden in local synthetic regression tests'); };
  const M = require(filename);
  const now = Date.parse('2026-11-07T12:00:00.000Z');
  const kickoff = '2026-11-07T09:00:00.000Z';
  const forecast = { id: '123456', league: 'epl', kickoff, home: 'Synthetic Home', away: 'Synthetic Away', homeId: '1', awayId: '2' };
  const input = {
    ...forecast, date: kickoff, state: 'post', statusName: 'STATUS_FULL_TIME',
    statusDetail: 'FT', period: 2, checkedAt: new Date(now).toISOString(),
    source: 'https://www.espn.com/soccer/match/_/gameId/123456', homeScore: '2', awayScore: '1',
    teams: [{ id: '1', side: 'home', score: '2', stats: { yellow: 0, corners: 4, shots: 10, target: 3, fouls: 6, offsides: 0, saves: 2, red: 0 } }, { id: '2', side: 'away', score: '1', stats: { yellow: 0, corners: 4, shots: 10, target: 3, fouls: 6, offsides: 0, saves: 2, red: 0 } }],
  };
  const score = M.resultObservation(input, 'score', now);
  const detail = M.resultObservation(input, 'analysis', now);
  if (!score || !detail) throw Error('Valid fixture normalization failed');
  const goals = { metric: 'goals', choice: 'over', line: 2.5, probability: .7, dotSelected: true };
  const yellow = { metric: 'yellow', choice: 'under', line: 4.5, probability: .7, dotSelected: true };
  const scored = (pick, observations) => ({ ...pick, outcome: M.evaluatePick(forecast, pick, observations) });
  const summary = picks => M.summarizeResults([{ picks }]);
  const settled = s => ({ settled: s.settled, hits: s.hits, misses: s.misses, hitRate: s.hitRate, brier: s.brier, byMetric: s.byMetric });
  const paths = [
    ['score-goals', goals, patch => [{ ...score, ...patch }]],
    ['analysis-goals', goals, patch => [{ ...detail, ...patch }]],
    ['analysis-statistics', yellow, patch => [{ ...detail, ...patch }]],
    // Valid latest status must not launder an invalid older statistical report.
    ['older-analysis-statistics', yellow, patch => [{ ...detail, ...patch, checkedAt: '2026-11-07T11:59:00.000Z' }, score]],
  ];
  const choices = { home: 'away', away: 'home', draw: 'home', yes: 'no', no: 'yes', over: 'under', under: 'over' };
  for (const pick of [
    { metric: 'result', choice: 'home' }, { metric: 'btts', choice: 'yes' },
    { metric: 'home', choice: 'over', line: 1.5 }, { metric: 'away', choice: 'under', line: 1.5 },
    ...['corners', 'shots', 'target', 'fouls', 'offsides', 'saves', 'red'].map(metric => ({ metric, choice: 'under', line: 100.5 })),
  ]) {
    const goalMarket = ['result', 'btts', 'home', 'away'].includes(pick.metric);
    paths.push([pick.metric, { probability: .7, dotSelected: true, ...pick }, patch => [{ ...(goalMarket ? score : detail), ...patch }]]);
  }
  for (const [name, pick, observations] of paths) {
    test(`${name}/valid-final-hit-and-miss`, () => {
      const hit = scored(pick, observations({}));
      const miss = scored({ ...pick, choice: choices[pick.choice] }, observations({}));
      assert.equal(hit.outcome.state, 'hit');
      assert.equal(miss.outcome.state, 'miss');
      const s = summary([hit, miss]);
      assert.equal(s.settled, 2); assert.equal(s.hitRate, .5);
      assert.ok(Math.abs(s.brier - .29) < 1e-12);
    });
    const cases = [
      ['period-null', { period: null }], ['period-undefined', { period: undefined }],
      ['period-zero', { period: 0 }], ['period-one', { period: 1 }],
      ['period-string-two', { period: '2' }],
      ...['', ' ', 'FT', '02', true, false, -1, 2.5, NaN, Infinity, {}, [], [2]].map((period, i) => ['period-malformed-' + i, { period }]),
      ['home-id-null', { homeId: null }], ['away-id-null', { awayId: null }],
      ['both-ids-null', { homeId: null, awayId: null }],
      ['home-id-undefined', { homeId: undefined }], ['away-id-undefined', { awayId: undefined }],
      ['home-id-empty', { homeId: '' }], ['away-id-empty', { awayId: '' }],
      ...[0, '', ' ', false, NaN, Infinity, -1, 1.5, {}, [], '1x'].flatMap((id, i) => [
        ['home-id-malformed-' + i, { homeId: id }], ['away-id-malformed-' + i, { awayId: id }],
      ]),
      ['ids-swapped', { homeId: '2', awayId: '1' }],
      ['extra-time', { period: 3 }], ['penalties', { period: 2, statusDetail: 'After penalties' }],
      ['cancelled', { statusName: 'STATUS_CANCELED' }],
      ['cancelled-state-pre', { state: 'pre', statusName: 'STATUS_CANCELED' }],
      ['aet-status', { statusName: 'STATUS_FINAL_AET' }], ['pen-status', { statusName: 'STATUS_FINAL_PEN' }],
      ['aet-detail', { statusDetail: 'After extra time' }], ['pen-detail', { statusDetail: 'Penalty shootout' }],
      ['postponed', { statusName: 'STATUS_POSTPONED' }], ['in-progress', { state: 'in' }],
      ['home-id-mismatch', { homeId: '99' }], ['away-id-mismatch', { awayId: '99' }],
      ['kickoff-mismatch', { kickoff: '2026-11-07T08:00:00.000Z' }],
    ];
    for (const [label, patch] of cases) {
      const title = `${name}/${label}`;
      test(`${title}/not-settled`, () => {
        for (const choice of [pick.choice, choices[pick.choice]]) {
          const outcome = scored({ ...pick, choice }, observations(patch)).outcome;
          assert.equal(outcome.state, name === 'older-analysis-statistics' ? 'unverified' : 'excluded', `must not settle as ${outcome.state}`);
          assert.equal(outcome.actual, null, 'invalid evidence must not expose a scored actual');
        }
      });
      test(`${title}/summary-excludes-evidence`, () => {
        const invalid = scored(pick, observations(patch));
        const empty = summary([invalid]);
        assert.deepEqual([empty.settled, empty.hits, empty.misses, empty.hitRate, empty.brier], [0, 0, 0, null, null]);
        assert.equal(empty.predictions, 1);
        assert.equal(empty[name === 'older-analysis-statistics' ? 'unverified' : 'excluded'], 1);
        assert.deepEqual(empty.byMetric, [{ metric: pick.metric, settled: 0, hits: 0, hitRate: null }]);
        const valid = [scored(pick, observations({})), scored({ ...pick, choice: choices[pick.choice] }, observations({}))];
        assert.deepEqual(settled(summary([...valid, invalid])), settled(summary(valid)), 'invalid evidence must not change mixed-sample denominators or Brier');
        assert.deepEqual(settled(M.summarizeResults([{ picks: [...valid, invalid, { ...valid[0], dotSelected: false }] }], true)), settled(summary(valid)), 'dot-only totals must also exclude invalid evidence and non-DOT picks');
      });
    }
    test(`${name}/numeric-ID-positive-control`, () => assert.equal(scored(pick, observations({ homeId: 1, awayId: 2 })).outcome.state, 'hit'));
    test(`${name}/STATUS_FINAL-positive-control`, () => assert.equal(scored(pick, observations({ statusName: 'STATUS_FINAL' })).outcome.state, 'hit'));
  }
  // Provider-shaped normalization and ID fallback must not mask missing evidence.
  for (const kind of ['score', 'analysis']) {
    for (const [label, patch] of [['period-omitted', { period: undefined }], ['ids-omitted', { homeId: undefined, awayId: undefined, teams: input.teams.map(t => ({ ...t, id: undefined })) }]]) {
      test(`normalized-${kind}/${label}`, () => {
        const observation = M.resultObservation({ ...input, ...patch }, kind, now);
        const outcome = M.evaluatePick(forecast, goals, observation ? [observation] : []);
        assert.ok(!['hit', 'miss'].includes(outcome.state), `normalized invalid evidence settled as ${outcome.state}`);
        assert.equal(outcome.actual, null);
      });
    }
    test(`normalized-${kind}/team-id-fallback-positive-control`, () => {
      const observation = M.resultObservation({ ...input, homeId: undefined, awayId: undefined }, kind, now);
      assert.ok(observation);
      assert.equal(M.evaluatePick(forecast, goals, [observation]).state, 'hit');
    });
  }
  test('cross-metric-aggregate-denominators', () => {
    const hit = scored(goals, [score]), miss = scored({ ...goals, choice: 'under' }, [score]);
    const stat = scored(yellow, [detail]);
    const excluded = scored(goals, [{ ...score, period: null }]);
    const unverified = scored(yellow, [score, { ...detail, homeId: null, checkedAt: '2026-11-07T11:59:00.000Z' }]);
    const pending = scored(goals, []);
    const s = summary([hit, miss, stat, excluded, unverified, pending]);
    assert.deepEqual([s.predictions, s.settled, s.hits, s.misses, s.excluded, s.unverified, s.pending], [6, 3, 2, 1, 1, 1, 1]);
    assert.equal(s.hitRate, 2 / 3); assert.ok(Math.abs(s.brier - (.09 + .49 + .09) / 3) < 1e-12);
    assert.deepEqual(s.byMetric, [{ metric: 'goals', settled: 2, hits: 1, hitRate: .5 }, { metric: 'yellow', settled: 1, hits: 1, hitRate: 1 }]);
  });
  test('one-one-draw-reproduction-and-positive-control', () => {
    const draw = { metric: 'result', choice: 'draw', probability: .4, dotSelected: true };
    const oneOne = { ...score, homeStats: { ...score.homeStats, goals: 1 }, awayStats: { ...score.awayStats, goals: 1 } };
    const hit = scored(draw, [oneOne]);
    assert.equal(hit.outcome.state, 'hit');
    assert.equal(summary([hit]).brier, .36);
    for (const patch of [{ period: null }, { homeId: null, awayId: null }]) {
      const invalid = scored(draw, [{ ...oneOne, ...patch }]);
      assert.equal(invalid.outcome.state, 'excluded');
      assert.deepEqual([summary([invalid]).settled, summary([invalid]).brier], [0, null]);
    }
  });
  test('latest-invalid-revision-never-falls-back', () => {
    const newer = { ...score, period: null, checkedAt: '2026-11-07T12:01:00.000Z' };
    for (const observations of [[score, newer], [newer, score]]) assert.equal(scored(goals, observations).outcome.state, 'excluded');
    assert.equal(scored(yellow, [detail, { ...detail, homeId: null, checkedAt: newer.checkedAt }, score]).outcome.state, 'excluded');
  });
  test('forecast-identity-missing-does-not-match', () => {
    for (const ids of [{ homeId: null }, { awayId: undefined }, { homeId: '' }, { homeId: '2', awayId: '1' }]) {
      assert.equal(M.evaluatePick({ ...forecast, ...ids }, goals, [score]).state, 'excluded');
    }
  });
  test('source-remains-unchanged', () => assert.equal(fs.readFileSync(filename, 'utf8'), source));
} catch (error) {
  errors++; console.error(`ERROR setup: ${error.stack || error}`);
} finally {
  if (originalTs) require.extensions['.ts'] = originalTs;
  else delete require.extensions['.ts'];
  global.fetch = originalFetch;
}
console.log(`SUMMARY mode=current-source total=${passed + failed + errors} passed=${passed} failed=${failed} errors=${errors}`);
process.exitCode = errors ? 2 : failed ? 1 : 0;
