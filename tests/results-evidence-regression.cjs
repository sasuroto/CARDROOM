// LOCAL-ONLY expected-correct-behavior regressions. All fixtures are synthetic.
// node tests/results-evidence-regression.cjs
// node tests/results-evidence-regression.cjs --candidate (in-memory patch or verified already-applied source)
// Exit 0: all pass; 1: assertion regressions; 2: execution/setup error.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let passed = 0, failed = 0, errors = 0;
const candidate = process.argv.includes('--candidate');
let mode = candidate ? 'candidate-validation' : 'current-source';
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) {
    if (error instanceof assert.AssertionError) {
      failed++; console.error(`FAIL ${name}: ${error.message}`);
    } else {
      errors++; console.error(`ERROR ${name}: ${error.stack || error}`);
    }
  }
}
try {
  if (process.argv.slice(2).some(arg => arg !== '--candidate')) throw Error('Unknown argument');
  const ts = require('typescript');
  const filename = path.resolve(__dirname, '../lib/results-model.ts');
  const source = fs.readFileSync(filename, 'utf8');
  let modelSource = source;
  if (candidate) {
    const replacements = [
      ['!(r.period>2)', 'r.period===2'],
      ['(!r.homeId||String(r.homeId)===forecast.homeId)', '(!!r.homeId&&String(r.homeId)===forecast.homeId)'],
      ['(!r.awayId||String(r.awayId)===forecast.awayId)', '(!!r.awayId&&String(r.awayId)===forecast.awayId)'],
    ];
    const count = anchor => modelSource.split(anchor).length - 1;
    const original = replacements.every(([before, after]) => count(before) === 1 && count(after) === 0);
    const applied = replacements.every(([before, after]) => count(before) === 0 && count(after) === 1);
    if (!original && !applied) throw Error('Candidate anchors changed or partially applied');
    if (original) {
      for (const [before, after] of replacements) modelSource = modelSource.replace(before, after);
      mode = 'in-memory-candidate';
    } else {
      mode = 'already-applied-candidate';
    }
  }
  require.extensions['.ts'] = (m, f) => {
    const input = f === filename ? modelSource : fs.readFileSync(f, 'utf8');
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
    teams: [{ id: '1', side: 'home', score: '2', stats: { yellow: 0 } }, { id: '2', side: 'away', score: '1', stats: { yellow: 0 } }],
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
  for (const [name, pick, observations] of paths) {
    test(`${name}/valid-final-hit-and-miss`, () => {
      const hit = scored(pick, observations({}));
      const miss = scored({ ...pick, choice: pick.choice === 'over' ? 'under' : 'over' }, observations({}));
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
      ['home-id-null', { homeId: null }], ['away-id-null', { awayId: null }],
      ['both-ids-null', { homeId: null, awayId: null }],
      ['home-id-undefined', { homeId: undefined }], ['away-id-undefined', { awayId: undefined }],
      ['home-id-empty', { homeId: '' }], ['away-id-empty', { awayId: '' }],
      ['extra-time', { period: 3 }], ['penalties', { period: 2, statusDetail: 'After penalties' }],
      ['cancelled', { statusName: 'STATUS_CANCELED' }],
      ['home-id-mismatch', { homeId: '99' }], ['away-id-mismatch', { awayId: '99' }],
      ['kickoff-mismatch', { kickoff: '2026-11-07T08:00:00.000Z' }],
    ];
    for (const [label, patch] of cases) {
      const title = `${name}/${label}`;
      test(`${title}/not-settled`, () => {
        for (const choice of ['over', 'under']) {
          const outcome = scored({ ...pick, choice }, observations(patch)).outcome;
          assert.ok(['excluded', 'unverified', 'pending'].includes(outcome.state), `must not settle as ${outcome.state}`);
          assert.equal(outcome.actual, null, 'invalid evidence must not expose a scored actual');
        }
      });
      test(`${title}/summary-excludes-evidence`, () => {
        const invalid = scored(pick, observations(patch));
        const empty = summary([invalid]);
        assert.deepEqual([empty.settled, empty.hits, empty.misses, empty.hitRate, empty.brier], [0, 0, 0, null, null]);
        assert.equal(empty.predictions, 1);
        assert.deepEqual(empty.byMetric, [{ metric: pick.metric, settled: 0, hits: 0, hitRate: null }]);
        const valid = [scored(pick, observations({})), scored({ ...pick, choice: pick.choice === 'over' ? 'under' : 'over' }, observations({}))];
        assert.deepEqual(settled(summary([...valid, invalid])), settled(summary(valid)), 'invalid evidence must not change mixed-sample denominators or Brier');
        assert.deepEqual(settled(M.summarizeResults([{ picks: [...valid, invalid] }], true)), settled(summary(valid)), 'dot-only totals must also exclude invalid evidence');
      });
    }
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
  test('source-remains-unchanged', () => assert.equal(fs.readFileSync(filename, 'utf8'), source));
} catch (error) {
  errors++; console.error(`ERROR setup: ${error.stack || error}`);
}
console.log(`SUMMARY mode=${mode} total=${passed + failed + errors} passed=${passed} failed=${failed} errors=${errors}`);
process.exitCode = errors ? 2 : failed ? 1 : 0;
