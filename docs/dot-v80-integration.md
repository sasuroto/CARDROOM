# DOT Predict + v80 palette integration

2026-11-03. Integration of the reviewed DOT implementation into Sites source commit 6c430133f17d8cd9a529e009cdbdaf20efdf7167 (published v80). The original independent review branch is not rewritten.

## Behavior

- Up to three pre-match scenarios, at most one per family. Scenarios can be correlated; not an accumulator.
- At least ten observations per team and metric, real source dates, freshness and match identity gates.
- Fixed-outcome sensitivity under independent ±20% changes to team means; selection requires a lower sensitivity bound of 65%. This is not calibration, a confidence interval or proven accuracy.
- Actual historical fetch timestamps survive cache reads; analysis cache schema advances to v11.
- Missing, stale, erroneous or live/post-match data suppress the selection. Percent formatting cannot round to 100%.
- Referee eligibility gates discipline scenarios. Referee adjustment applies to yellow cards, not fouls.
- Experimental-model badge; no AI API, autonomous news feed, emotional-state inference or weather probability adjustment.
- v80 palette retained. DOT uses a scoped div heading so global dark header styles cannot apply to it. Existing selected matches and refresh intervals are unchanged.

## Verification

- 54 test files passed, including v80 contrast checks and DOT logic, provenance and rendered-state tests.
- TypeScript: passed with --noEmit --incremental false.
- git diff --check: passed.
- Production build: passed with the existing large-chunk and route-classification warnings.
- Browser preview unavailable: daemon reported http://terminal.local:4173/ but the cloud browser returned ERR_CONNECTION_REFUSED. Preview stopped. Desktop/mobile visual QA is not claimed.

## Still outstanding

Historical out-of-sample validation/calibration and browser visual verification. Publishing this feature does not certify data coverage across all nine leagues or completion of a scheduled refresh.
