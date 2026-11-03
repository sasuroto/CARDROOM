# DOT Predict — review only

This branch is not deployed. Do not merge or publish during the independent audit.

## Changed behavior

- Global reading-theme CSS, no component CSS import or same-basename CSS file.
- At least 10 finite integer observations **per team and metric**; fewer scenarios or no selection is valid.
- Selection uses the minimum of a ±20% mean sensitivity grid, with a 65% policy cutoff. This is **not a confidence interval, calibration, or evidence of real-world predictive accuracy**. The selected outcome stays fixed. Result and BTTS vary both team means independently.
- Each scenario exposes its actual sources and fetch dates, including each cached historical protocol and the referee table used for yellow-card adjustment. Missing dates suppress selection. Analysis cache v11 preserves the old per-protocol timestamp rather than relabelling it with the new summary time.
- Source age limits: summary 15 minutes, historical protocols 24 hours, seasonal/referee tables 7 days. Existing official-referee eligibility remains required for discipline.
- Shared percent formatting never rounds to 100%. No autonomous news research or emotional-state adjustments. Club notices are manually maintained and expire; unrelated/unnamed teams are rejected.
- Lineups must belong to both teams in the current, fresh analysis. DOT's clock is passed from a cleaned-up 15-second timer; no Date.now call in the DOT render.
- Uses the existing v79 warm-theme tokens. Main CARDROOM scenario calculations outside DOT are not given a new N>=10 eligibility policy by this patch.

## Reproducible checks

The review branch includes the site's existing **non-secret** `.openai/hosting.json` (same project ID and BUCKET binding, unchanged). This repairs the missing build input in previous GitHub exports. It does not grant deployment or service access. Do not use an old manifest from v75.

With the existing dependencies installed:

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
for test_file in tests/*.cjs; do node "$test_file" || exit 1; done
npm run build
```

New regression coverage: `dot-provenance.cjs` tests the API cache timestamps; `dot-render.cjs` tests rendered ranges, source dates, sparse/stale/start/error behavior; expanded `dot-predict.cjs` covers N=9 rejection, independent sensitivity, frozen outcome, lineage gates, lineup identity, notices and formatting. No CSS loader stubs.

Validation on 2026-11-03: 54/54 test files passed, TypeScript passed with incremental compilation disabled, production build passed. DOT selectors were verified in the generated client CSS. Build still reports the existing >500 kB chunk warning; this is not a test failure. No deployment performed.

## Remaining limitations for review

The Poisson model is not calibrated, ±20% is arbitrary sensitivity rather than distributional uncertainty, and 10 games is a minimum policy rather than proof of adequacy. Rates do not account for all opponents, lineup changes, travel or emotional context. No odds/value ranking; high-probability obvious events can dominate. No automated news feed. Browser visual QA remains unverified: managed preview reports running but cloud browser returns ERR_CONNECTION_REFUSED. Automated rendering is tested, not a substitute for browser QA.
