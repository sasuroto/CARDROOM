# Experimental exact score 1:1 — review branch, not deployed

Owner: Codex. Base: live Sites v107, source `d2f1dad3f0a5aeb359cf0209cdade328331a9355`. Branch: `feat/exact-score-11-experiment`. User requires separate approval for publication and main merge. No live migrations, forecast writes, schedule changes or provider requests were performed by this feature's offline audit.

## Models

Version `cardroom-11/1`, with separately versioned Poisson, Dixon–Coles and historical-frequency implementations. The existing scenario engine exports the new builder but neither its 10 primary scenario IDs nor DOT selection/65% threshold changes. My Matches and existing prediction payloads remain unchanged.

For home i and away j: log(lambda) = intercept + home advantage + attack_i + defence_j; log(mu) = intercept + attack_j + defence_i. Both team effects sum to zero. Defence >1 means conceding more, not stronger defence. Poisson is independent: P(1,1)=exp(-lambda-mu)*lambda*mu. Dixon–Coles uses the original four-cell tau correction, including tau(1,1)=1-rho, fitted jointly with the team and home parameters by maximum likelihood. Zero is only an optimization initialization, not a selected correction. The probability mass is normalized without truncating score outcomes. Expected goals here are model means, NOT provider xG.

Reference: Dixon & Coles (1997), JRSS C 46(2), 265–280, DOI https://doi.org/10.1111/1467-9876.00065 . This implementation does not inherit the paper's historical betting-profit findings. It uses a trailing 365-day window with equal weights, not an estimated time-decay parameter.

Analytic gradients and inverse BFGS with Armijo line search; normalized gradient <1e-5, max 500 iterations. Both attack/defence identifiability constraints are explicit. Rank-deficient design, uninformative DC correction, teams with no goals scored/conceded, nonconvergence or invalid tau yield unavailable, never a made-up percentage. Tau must be positive for every pairing of represented teams.

Versioned engineering gates: ≥100 matches, ≥4 and ≤40 teams, ≥8 games for every represented team, ≥2 at each venue, full-rank constrained design; latest match within 30 days. These are screening constraints, not evidence that the model is calibrated or useful. Newly promoted or thinly observed teams can block training; no fallback to three-game estimates.

## Evidence and chronology

Only the existing D1 `journal_observations` is read. No third-party feed, arbitrary import endpoint or invented history is introduced. Results must match ESPN match URLs, numeric team IDs, league, kickoff, known full-time status and period 2. Extra time, shoot-outs, suspended/postponed games, unknown periods and null goals are not settled as losses.

Each training cutoff requires BOTH source checked_at and actual observed_at to precede it. Latest admissible revisions are selected as of that cutoff. A corrected result acquired tomorrow cannot change yesterday's training inputs. Games acquired retrospectively cannot pretend to have been known before acquisition. Model snapshots retain training references, scores, cutoff, availability dates, sources, fitted parameters, optimizer diagnostics and policy. This is observed-only coverage, not a full league archive or off-site backup.

Bounded read: at most 3000 revisions of one league. More than that returns an explicit limit error, not a biased tail sample; a versioned archival reader is needed before increasing coverage. This bound is deliberate for Worker memory/CPU. There is no training scheduler or promise of all-match capture.

## Validation

`GET /api/exact-score?league=<connected ID>` is read-only and provider-free. It trains at each UTC seven-day block boundary using the previous ≤365 days of already available results, then evaluates the following block. Up to eight recent blocks; no within-block refitting or hyperparameter selection on test results. Only the common cohort where both models and the training-frequency baseline are available is compared. History exclusions and training skips are reported separately (revision counts and match counts must not be added).

Binary Brier and natural-log loss for event 1:1; log loss clips to [1e-15,1-1e-15] only for numerical evaluation, not stored probabilities. Ten fixed-width probability bins report N, mean probability and observed frequency; ECE is descriptive and bin-dependent. Empty metrics/bins are null. No automatic winner, trading edge, stake or profit claim.

### Actual read-only audit, 6 November 2026 10:41 UTC

Read all 60 stored revisions using Sites' bounded database reader, in memory only. Latest admissible regular-time outcomes: 42 fixtures, with kickoff dates 4–5 November. They were acquired on 6 November, after those fixtures.

| League | Usable history now | Historical candidates | Paired evaluations | Skipped |
| --- | ---: | ---: | ---: | ---: |
| UCL | 7 | 7 | 0 | 7 |
| UEL | 17 | 17 | 0 | 17 |
| UECL | 18 | 18 | 0 | 18 |

The other 13 configured leagues have no observations in this read. At each historical training cutoff there were **zero** already-observed training matches. All three models' live-data Brier/log loss/ECE are null. Missing data: dated pre-cutoff history meeting league/team/venue/rank gates, followed by held-out outcomes. This cannot be repaired by backdating the 42 results or adding retrospective predictions. Synthetic fixture test metrics are NOT live performance.

Offline reproducible entry point: `node scripts/exact-score-audit.cjs`, JSON on stdin `{revisions:[{key,availableAt,observation}],now?}`. It only prints aggregate audit results; never writes forecasts or live data. Runtime exports are not committed.

## Append-only journal compatibility

Schema-only migration `0002_exact_score_11.sql` adds `journal_exact11`; original tables/migrations are untouched. This replaces the unpublished experiment's `0001_stiff_dormammu.sql` numbering because v108 already uses migration 0001 for Drive OAuth. The regenerated snapshot includes both OAuth tables and the exact-score extension. One immutable record per league:match contains both models. Atomic INSERT OR IGNORE uses SQLite server time and rejects post-kickoff or future-computed writes. Repeat requests return the first snapshot. Both early reads and concurrent insert readbacks check current identity/kickoff before displaying archived probabilities. Reschedules preserve the old row and do not create a retroactive replacement.

Existing `/api/analysis` adds `exactScore11`; existing `/api/results` adds a separate experimental section. Legacy scenario totals and DOT do not include these new rows. Experiment failure does not discard successful legacy results. No experiment schema is created at request time. `/api/results` still succeeds for legacy tables if the optional new table is absent, exposing the experiment as unavailable.

Outcomes use current confirmed regular-time observations and can change when a source corrects a result; stored probabilities never change. Unknown/changed fixtures remain unverified/excluded. Journal reads use bounded batches, not one D1 query per game. The existing v105 R2 backup covers neither D1 table nor this extension. No live migration or write is claimed before approved publication.

## Stage two

Typed xG contract requires fixture identity, provider URL, observed/published times before the prediction, sample period, size and definition version. No adapter is connected and xG is not fed into either current model.

Typed exact-score market contract requires regular-time scope, matching fixture/kickoff, source, bookmaker, quote/observation time, unique explicit scores plus a quoted residual covering ALL other scores. Partial markets are rejected. Proportional inverse-odds normalization reports overround and a probability difference only; other de-vig methods may differ. A future trusted adapter must verify source semantics. No automatic betting, retrospective closing-line comparison, profitability or edge is implemented.

## Release gate

Integration with v108 (7 November): the prepared archive-v2 reader rejects any
extra journal table as `unsupported-schema`. Applying exact-score migration 0002
therefore blocks the entire v2 capture until its format/allowlist, restore drill
and tests are explicitly extended. This is a deployment gate, not a completed
backup or an invitation to weaken the fail-closed check.

Requires passing current tests/typecheck/build, browser desktop/mobile QA, review of the additive migration and explicit user publication approval. Preview attempt was blocked by another vinext dev-server lock (PID 14, /site); daemon status is stopped. No server was killed, no browser infrastructure bypass used. SSR and responsive CSS contract tests do not replace browser QA. The existing calendar rate-limit test showed intermittent scheduling-sensitive failure (29/32 requests in one mocked-clock run) and also passed on rerun; this is not silently treated as a new model failure or fixed by changing provider limits. Final test evidence is recorded in the handoff.
