# CARDROOM handoff — 2026-11-06

## GitHub v119 synchronization — 8 November 2026

See [source-sync-v119.md](source-sync-v119.md) for the verified published calendar/summary source and GitHub validation. Older local-candidate wording is preserved as historical implementation evidence; it does not override the confirmed v119 publication.


## Calendar admission and retry priority — 8 November 2026, local candidate

Owner: Codex. Branch `fix/calendar-queue-fairness-20261108`, exact Sites v118
source `8a17106295c16c6d880f66381a62add0fda84eda`. See [calendar-queue.md](calendar-queue.md)
for implementation, scope, reproducible fixture measurements and validation.
Four request-local query jobs replace eager 32/48-ticket submission. The ESPN
queue, timeout, concurrency, pending limit and cooldown are unchanged. A 30-second
**dispatch cutoff is not a total response deadline**. Started jobs are awaited.
Never-dispatched coverage leads cached error priority on subsequent eligible
attempts, including all-malformed responses. This depends on retained readable
aggregate cache and is not durable/distributed fairness.

Short explicit retry hints no longer remain behind a 5/30-minute partial-cache
TTL; known provider cooldowns remain effective. Generic failure TTLs, successful
cache TTLs, timestamps, fallback, scope and journal behavior are preserved.
The new 64-check offline suite reproduces the old 28/32 request dropout and proves
32/32 at 2.2 seconds. Workerd verifies independent calendar request ownership and
cancellation. Full final validation and exact-commit review closeout are recorded
in the linked note. No publication or provider/production call is included.



## GitHub v118 synchronization — 8 November 2026

See [source-sync-v118.md](source-sync-v118.md) for the verified production baseline, scope, validation and excluded concurrent work. Imported production-source notes below retain historical local-candidate wording; they do not override the verified Sites v118 publication or authorize new deployment.



## Aspmyra location and missing-referee diagnostics — 8 November 2026, local candidate

Owner: Codex. Branch `fix/match-location-referee-diagnostics`, based on published
Sites v117 source `a9972cc7dcebba994e939ec3f32a62a527df8854`, including the separate
1:1 navigation repair. No push, publication, production/provider request, cache
migration, schema, settings, access or schedule change is part of this patch.

A narrowly scoped shared correction maps only Aspmyra Stadion / Norway /
Bodø-Glimt's erroneous provider city to Bodø. It applies to the fresh venue
parser, cached/fallback match responses, UI merge and formatter. Original city
and official club source are retained; the source link is visible. Partial
unchanged locations preserve attribution; another venue/city removes it.
Coordinates are not invented. Weather receives the corrected city through the
existing match handler and keeps its original horizon, providers, TTL and scope.
Old cache entries are not migrated or erased.

An absent UEFA row no longer conceals a failed check when no name is known.
Missing data and finite redacted error states reach the UI. Confirmed names and
success timestamps retain their existing priority. `appointmentDiagnosticAt`
orders the combined diagnostic by actual source attempts, separately from the
selected failing source's original `appointmentLastAttempt`; it never renews
UEFA's `checkedAt` or creates an appointment. This handles two-source failure,
partial recovery, complete recovery and late/undated result rejection.

The focused offline suite covers 56 cases, including actual match/weather
handlers, legacy cache, fallback, source/identity guards, provenance removal and
recovery ordering. Independent review found and rechecked provenance cleanup and
multi-source recovery fixes; no blockers remain. It passed 38 additional ordering
and provenance assertions and 40 actual-route error/backoff assertions. Browser QA
of the actual component and compiled CSS passed desktop, 320px and 390px: correct
city/source, all referee states, disclosure and no overflow. This was an isolated
synthetic component harness, not full modal/SSR/backend or real-device QA.

The final sequential run passed all 80 suites, TypeScript and production build.
The existing large-chunk build warning remains. Changed production files retain
their existing lint baseline (25 errors, one warning);
the new test has no lint diagnostics. No general lint-clean claim is made. The
source repair does not claim that an absent referee is unappointed, or promise
future weather availability. Next owner is the release coordinator after a fresh
Sites source/audience preflight and compatibility review with concurrent work.


## Scenario 1:1 navigation retention — 8 November 2026, local candidate

Owner: Codex. Branch `fix/oneone-refresh-20261108`, exact Sites v116 source
`828f429789f1e9bbf38b744924686ff20050169d`. Live browser reproduction confirmed
that Refresh completes (five examined, two candidates), but Back to Matches and
Forward to Scenario unmounts the component and resets its result to the initial
prompt. This does not establish which action caused the user's screenshot.

Home now owns an in-memory, per-league result/error map. Panel navigation restores
it without a request; full page reload starts a fresh session. Interrupted work
is aborted and explicitly described, never restarted automatically. Duplicate
clicks are guarded; aborted progress/completion cannot overwrite newer work.
Prior dated results survive loading, thrown errors and incomplete zero-candidate
checks. A successful complete empty check still replaces the previous result.

Restoration never renews search, analysis or fixture timestamps. Candidates are
hidden at kickoff, five minutes after the search/analysis, or thirty minutes
after fixture evidence. These are presentation limits only; API TTL, provider
backoff, the manual three-day/six-match filter, storage and scoring are unchanged.
A local timer invalidates visible candidates without fetching. Historical count,
dates, limitations and skip reasons remain labelled as the previous check.

The new offline lifecycle regression failed on v116 at the Back/Forward result
restoration assertion and now passes 39 lifecycle/loader checks. Existing page
navigation coverage additionally verifies the same session survives popstate.
TypeScript and focused new-code lint passed during implementation; full sequential
suites, final build and independent review are being run by the coordinator.
No push, deployment, production API request, data write, dependency/schema or
settings change is included. The official installer's temporary store-path edit
was restored before review. Browser reproduction is on production v116; patched
browser QA must be recorded separately and is not claimed by these hook tests.


## Rollback compatibility and cache isolation — 8 November 2026, local only

Pre-release review reproduced proof loss using the exact v115 analysis route,
writer and normalizer with synthetic SQLite/R2. A later timestamp-only proof
recheck updates the cached response without creating a journal correction.
Rolling back to v115 against that shared cache can then create a newer legacy
period-2 observation with its corroboration proof discarded.

The candidate now uses `analysis/v12` exclusively. It does not read, delete,
rewrite or migrate `analysis/v11`. All existing v11 bytes remain untouched.
The first v12 request is a cold cache miss and still respects the existing ESPN
host backoff and admission controls. The analysis TTL is otherwise unchanged.
This isolates new proof-bearing cache entries from old source, but is not by
itself a fully compatible rollback: old archive verification cannot validate
already-written digest-version-2 observations.

A safe rollback source must preserve v12, proof-aware journal capture, the
shared digest validator and compatible archive verification, while disabling
only new summary/scoreboard corroboration. Its cached valid proofs remain
explicit and auditable; malformed/future proofs remain rejected. Fresh summaries
without period stay unknown, and may append an excluded revision. Do not fall
back to old hits to preserve settled counts. No production cache reset, old-row
rewrite or hidden migration is authorized or performed.

Build any release rollback from the same integrated release base, including
source policy guards. An unmodified v115 deployment is not the promised rollback.
The separate local compatible rollback branch is preparation only, not a saved
or published Site version. Both candidate and rollback require their exact
source/test/build verification before release.

## Missing summary period corroboration — 8 November 2026, local only

Owner: Codex, continuing after local propagation commit `7f4b2ae`. No production
request, row replay, push or publication is part of this implementation. The
coordinator's bounded public ESPN samples are recorded in the prior section.

A newly received summary with an absent/null period can now be corroborated
against the same ESPN league's scoreboard for its UTC kickoff date. This is
correlation between two ESPN endpoints, not independent-provider confirmation.
The helper requires one exact event and competition, matching league, kickoff,
home/away IDs and scores, explicitly completed post/FT statuses, numeric
scoreboard period 2, and no AET/penalty text or conflicting status. Malformed,
string or explicit non-2 summary periods are never replaced. Multiple events,
competitions or sides, missing IDs/scores, mismatches and unknown status fail
closed. No clock/FT inference, prior calendar-row reuse or relaxation of the
existing period/identity settlement guards is used.

Analysis `checkedAt` is captured on receipt of the summary, before scoreboard
and history work, rather than at the end of that work. Proof timestamps must be
within 120 seconds and not future at ingestion. The scoreboard raw cache uses
a 60-second TTL with the same `espn` admission/backoff and cache helpers. It is
written only after the current match passes corroboration. Malformed/empty
HTTP 200, mismatch, timeout or backoff preserve last-good cache bytes/time,
but do not present them as new confirmation. The existing analysis-cache TTL
is unchanged; cached responses retain their original source timestamps.

New corroborated observation payloads retain `schemaVersion:1`, add explicit
`digestVersion:2`, `summaryPeriod:null`, and `periodEvidence` containing both
source URLs/timestamps and all compared facts. The SQL schema is unchanged.
`observationDigestFacts` is shared by the journal writer and archive verifier:
legacy rows keep their exact prior hashing algorithm, while version 2 omits
only the known proof timestamps from its semantic digest. All timestamps remain
in the raw payload. Unknown digest versions and malformed proof fail closed.
Writer-time validation rejects future cached proof; archive validation checks
historical source times/gap without using today's clock. Deploy writer and
archive verifier together; an older verifier cannot read these new rows.

Timestamp-only rechecks do not create revisions. A changed score or evidence
fact appends a new revision. If a subsequent genuine summary still lacks period
and scoreboard confirmation fails, its new unknown observation remains excluded
under the existing guards. Settled counts may decrease again; the system does
not retain an old hit merely to preserve accuracy/counts. Old forecasts and
observations are never rewritten or deleted.

The new 152-check offline regression covers strict identity/status/proof
mutations, source-time directions, actual analysis routes, real SQLite capture,
legacy/null history, correction/idempotency, cache and 429 behavior, 31-minute
history delays, malformed/future cached proof, and actual archive capture,
verification and isolated SQLite restoration of mixed legacy/versioned rows
one day later. Final checks: all 76 suites passed, TypeScript and production build passed,
and new-code/new-test ESLint is clean. The build retains its existing large-chunk
warning. Whole-directory `npm run lint` exhausted Node memory with default and
4 GB heaps. Linting every tracked source/test plus the new files completed with
1,091 errors/47 substantive warnings, matching the recorded baseline (four extra
ignored-build-file notices are not source diagnostics). General lint is not clean.

Independent review found no remaining blocker after requesting last-good-cache
preservation and writer-time future-proof rejection. The reviewer reran the
152 causal, 38 pipeline, 1,886 guard, 90 historical-read and 22 archive checks,
and added 13 digest, 31 source-corroboration and 27 status-coherence checks.
The backup worker independently verified the same shared helper with mixed
legacy/versioned encrypted capture/restore tests and actual isolated workerd
D1/R2. This is still a local candidate, not production recovery.

Release/recovery plan: deploy the reviewed writer, parser and shared archive
verifier as one source state with unchanged Site audience. Then use only the
normal authorized analysis workflow for a bounded set of affected fixtures,
respecting TTL/backoff. Read back each new revision and its two-source proof,
check immutable historical bytes/forecast counts and recompute current outcomes.
Do not set a target settled count, inject payloads or backfill old null periods.
Unknown/conflicting matches remain excluded for later genuine verification.

## Status period propagation candidate — 8 November 2026, local only

Owner: Codex. Branch `fix/journal-period-20261108`, isolated from verified Sites
v115 commit `640516c6c5c17e633ce5aee951fc53f6ee17b23e`. The official Sites source
workflow refreshed source into a separate unchanged base. No GitHub main source
was substituted. No push, publication, runtime request, production write, schema,
environment, credential persistence, access, backup or schedule change occurred.

The match detail route dropped summary period and team IDs. The shared status
normalizer also omitted these fields, allowing a newer score/status to retain an
older period/identity. Calendar merging could attach incoming period/IDs to a
rejected older status. This bounded repair carries these evidence fields together
with their accepted status snapshot. Missing/malformed values become null;
period is never inferred from FT, clock, score or another response. Numeric
period 2 and matching identity settlement guards remain unchanged.

Important diagnostic limit: the analysis route already preserves numeric
`header.competitions[0].status.period` through `compactMatch`, `recordAnalysis`
and `resultObservation`. The synthetic actual-route regression proves that on
unmodified v115 too. A calendar period 2 followed by an analysis period null is
not evidence that a numeric field was dropped within the analysis pipeline:
these can be different upstream responses. The incident's historical raw summary
was unavailable. The coordinator's single read-only ESPN check on 8 November
08:03:32Z found match 401880168's current summary status had no period. A single
scoreboard check at 08:04:47Z found numeric period 2 with the same event ID,
league, kickoff, team IDs and 2:1 score. This establishes a current endpoint
coverage difference, not the exact bytes of the earlier incident response. This candidate fixes demonstrated propagation defects but does
not claim to establish the incident's cause or restore 95 settled outcomes to 110.

The new offline test uses actual analysis and match routes, fixture/status
normalizers, journal writer, settlement evaluator and real in-memory SQLite.
It covers verified period, unknown/string/extra-time periods, identity/status
rejection, legacy cache without period, unchanged cache timestamps and TTL,
stale failure fallback, persisted provider backoff, revision append/idempotency,
unchanged forecast bytes and every historical observation. Unmodified v115
fails at the match route period/IDs assertion after passing the analysis path.
No old raw cache or journal payload is rewritten by the implementation.

Historical recovery remains separate from publication. Preserve all forecasts,
observations and revisions. After verifying the actual provider schema and a
fresh response for each affected match, only a genuinely confirmed observation
may be appended through the normal writer. Never backfill period 2 from a
previous calendar row, FT text or a target settled count. A fresh calendar score
may restore goal-market eligibility, but statistical markets require a matching
confirmed analysis report. Unknown/extra-time/penalty/mismatching evidence stays
excluded. Respect cache TTL and provider backoff; read back newly appended
revision IDs/timestamps and aggregate results before claiming recovery.

Verification: all 75 regression suites passed (74 existing plus the new suite);
the final new suite passes 38 checks. TypeScript, production build, new-test
ESLint (zero errors/warnings) and diff checks passed. Build retains its existing
large-chunk warning. Full lint and independent review are recorded separately
by the release coordinator. This is a local candidate, not a production incident
resolution.

## Mobile Results navigation — 8 November 2026 (Tbilisi), local only

Owner: Codex. Branch `fix/mobile-results-v114-20261108`, isolated from exact
v114 source `e97e764ab971bb2426f5a210abbf96502201be99`. The base checkout remains
unchanged. There is no configured remote, so no remote-head refresh is claimed.

Only `app/product-upgrade.css` changes runtime behavior. At widths up to 650px,
the existing Results container is no longer hidden: it gets a full flex line in
the already wrapping, auto-height header. Its existing native `/results` anchor
has a 44px minimum height. Brand, search, DOT, favorites, link text, focus outline,
DOM order and all desktop rules remain unchanged. No duplicate link, custom
keyboard handler or extra hidden control was introduced. My Matches and Today's
strip, all routes, data/provider code and storage are byte-identical to v114.

Verification:
- All 74 regression suites passed sequentially: the existing 73 plus the new
  mobile-navigation suite.
- New offline regression: 34 actual Home/Results SSR and CSS-contract checks.
  Covers one native accessible link, return link, existing header controls, panel
  order, zero SSR fetches, mobile full-row/target rules and breakpoint applicability
  at 320/360/390/650/651/800/1166px. This is not browser layout verification.
- TypeScript, production build, new-test ESLint and diff checks passed. Build
  retains its existing >500 kB chunk warning. Repository-wide lint was rerun and
  still fails with 1,091 errors/47 warnings; general lint is not clean.
- Independent code review found no blocker and confirmed the CSS diff is only
  the old hiding-rule substitution. Reviewer reran the new 34 checks plus
  navigation/DOT/selected tests; an in-memory old-CSS mutation fails as expected.

- Independent browser QA passed on this exact CSS: rendered CSS layouts at
  320/360/390/650px show the Results link with a 44px height, brand and all header
  controls visible without overlap or horizontal page overflow. Desktop layouts
  at 651/800px and direct 1166px passed as well. Header → My Matches → Today →
  content order remains intact.
- At 320px, Tab from Favorites focuses Results with its 2px outline. Native Enter
  and pointer activation both navigate to a same-origin local `/results/` stub;
  Back restores Home and My Matches. Actual 320px and desktop screenshots were
  independently inspected. This was an isolated synthetic preview with mocked
  fetch and CSP isolation, not phone-touch emulation or production. The stub
  verifies href, activation and Back, not the journal backend. The actual Results
  component is separately covered by SSR above.

Application CSS SHA-256:
`8639492ad4487c3bdd6c960b9a479c223b6675011bd5cc1b8a7ebc8af8e7d8d8`.
Reproduce: `node tests/mobile-results-navigation.cjs`,
`for t in tests/*.cjs; do node "$t" || exit 1; done`,
`npx tsc --noEmit --incremental false -p .`, `npm run build`,
`npx eslint tests/mobile-results-navigation.cjs`, and `npm run lint` (known fail).

No push, merge, deployment, production page/API request, provider request,
schema, environment, credential, access, backup or schedule change occurred.
Next owner: release coordinator. Publication remains separately gated; local
checks do not establish production health or provider coverage.

## Journal evidence guards — 8 November 2026 (Tbilisi), local only

Branch `fix/journal-integrity-v113-20261108`, based on the exact
v113 source `def6a552c9a1ad3307cdd8de7b53baf9974f10d1`. Work is isolated in a
separate worktree; the base checkout is unchanged. Read-only GitHub metadata
confirmed PR #10 open/draft/unmerged at
`22158260b86efa3b35ddde08afbf208f5f9ff620`. Only its two settlement guard lines
were transferred, with schema-1-compatible tests. Its standings diagnostics,
PR #8/#9 exact-score experiment, archive changes and migrations are not included.

The latest status must have numeric period 2 and both matching team IDs before
any hit/miss is derived. Otherwise its outcomes are excluded. When only an older
statistical report lacks this evidence, its statistical picks are unverified
while confirmed goal-based outcomes remain eligible. Confirmed ordinary finals,
numeric/string ID compatibility and genuine zero statistics retain their behavior.
This is not a general validator for arbitrary JSON IDs: existing String coercion
is deliberately unchanged.

Previously saved incomplete outcomes now leave accuracy, per-metric and Brier
denominators, including DOT, on read. Those rates can rise or fall; an empty settled
sample remains null. Forecasts, observations, their hashes/dates and all revisions
are retained byte-for-byte. No schema/model version, ingestion normalizer or archive
format changes, and no backfill or data migration. Production rows and the actual
size/direction of production aggregate changes were not inspected or estimated.
See `docs/results-journal.md` for the read-time compatibility details.

Verification on final application/test hashes:
- All 73 regression suites passed sequentially (the existing 71 plus two new suites).
- New evidence suite: 1,886 cases covering 13 metric types, incomplete/malformed
  periods and nonmatching IDs, cancellations/AET/PEN, reversed identities, valid
  finals, latest revisions and ordinary/DOT denominators. Reverting only the period
  guard fails 485 cases; only the ID guard fails 455; both fail 937, with no setup
  errors. These mutation checks change source in memory only.
- New historical suite: 90 checks across 14 synthetic fixtures using actual SQLite,
  the existing schema-1 migration, real reader and GET handler. Query-only mode,
  SELECT-only adapter, total_changes and exact stored-byte comparisons confirm zero
  writes/fetches and preservation of every revision. Old guards fail this replay.
  Existing journal (61) and archive-v2 (22) checks also pass.
- TypeScript (`tsc --noEmit --incremental false -p .`), production build, new-test
  ESLint and diff checks passed. The existing >500 kB build warning remains.
  Full lint retains exactly 1,091 errors/47 warnings. The model's 23 errors/0 warnings
  match the baseline rule/message/node/line findings; general lint is not clean.
- Independent review found no blocker; 204 additional checks and both new suites
  passed.

Application file SHA-256: `d747b5f03f7a5d3982c8e9f560cc1e1a36ac4731aafa0e038cc44366a5c1840f`.
My Matches remains byte-identical at
`5bfcbfbc3ae31b38e6633f0f2c106e76b290f79a35c8a82792ec08428eca2dcb`.
All UI/API/backup/fixture files and the deterministic test clock are unchanged.
Reproduce from the checkout: `for t in tests/*.cjs; do node "$t" || exit 1; done`,
`npx tsc --noEmit --incremental false -p .`, `npm run build`, and
`npx eslint tests/results-evidence-regression.cjs tests/results-history-readonly.cjs`.
No new browser/UI QA is claimed. No production health retry, provider/production
request, live DB read/write, push, merge, deployment, secret or access change occurred.
Next owner: release coordinator to review this local commit and obtain publication
approval. Passing local checks does not establish production health or data coverage.

## Deterministic regression clocks — 8 November 2026 (Tbilisi), local only

Owner: Codex, continuing `fix/selected-match-freshness-v112-20261108` from
`4440a357e928ec64257eff07472b25b22c499a48`. This follow-up changes tests and this
handoff only. All application/backend/provider files and the existing 119-check
selected-match regression remain byte-identical. No remote is configured in this
checkout; no remote-head refresh or publication is claimed.

Both remaining aggregate failures now have demonstrated test-clock causes:
- Daily strip mocked Date.now but left default new Date on the host date. The
  original 45-check test passes with a host date before Tbilisi midnight on
  7 November and fails its fresh-card assertion at/after midnight. One virtual
  clock now controls Date(), new Date() and Date.now, preserving explicit date
  construction, parse and UTC. The component's requested day and actual midnight
  tick/new-day response are additionally checked. Existing 45 checks are retained.
- Calendar mixed real 50 ms admission timers with setImmediate fetches and advanced
  fake time by completion count. A recorded failing run let request 5 finish at
  +4 s before requests 6–9 started; requests 6–8 then both started and finished at
  +4 s, not the claimed two-second latency. The clock reached +16 s after just
  29 requests, so the unchanged 15 s admission guard correctly expired the rest.
  The new test schedules every fetch for its own 2000 ms on the same virtual clock
  as admission timers and timeout signals. All 32 distinct requests run four-wide,
  with the final wave starting at 14 s and completing at 16 s. No product budget,
  slot limit, source policy or assertion was relaxed.

The bounded test helper drains promise continuations between timer callbacks and
rejects concurrent clock pumps. Its supported subset is documented, not claimed
as a complete Node/Workers event-loop emulator. Both suites restore their date,
timer, fetch, module and React/favorites overrides in finally. Injected assertion
failures independently confirmed cleanup. Additional negative controls verify one
65th-request overflow before 14999 ms, 60 queued expirations exactly at 15000 ms,
and 2200 ms provider latency producing only 28 requests with two failed leagues.

Final verification on identical test-file hashes:
- All 71 regression suites passed, including 49 daily-strip, 26 calendar-rate-limit,
  25 clock-helper and the unchanged 119 selected-match checks.
- 24 additional focused runs passed across six simulated ambient dates from 2025
  through 2028, both test orders and UTC/Asia-Tbilisi/America-Los-Angeles time zones.
  These were host-date wrappers, not changes to the machine clock.
- TypeScript, production build, changed-test ESLint and diff checks passed. The
  existing large-chunk build warning remains. Repository-wide lint was also run:
  1091 errors and 47 warnings remain in unchanged files; general lint is not clean.
- Independent Codex review found no blockers, reran the three changed suites and
  passed seven additional scheduler edge checks. In-memory mutations to concurrency
  and shorter/longer queue budgets were caught by assertions. This was actual
  separate review, not Claude review or a self-review.

Evidence is local under `/tmp/cardroom-test-clock-evidence`; the independent review
is `/workspace/shared/cardroom-test-clock-review-20261108/REPORT.md`. The preceding
68/70 aggregate result below is historical and is superseded by this 71/71 local
run. No new visual/browser QA is claimed because this increment changes no UI.
No GitHub/Sites publication, production request/mutation, external provider I/O,
data, secret, access or setting change occurred. Next owner: release coordinator,
with publication still requiring separate approval. A local test pass does not
prove production health or remedy the pre-existing source coverage limitations.

## My Matches status freshness — 8 November 2026 (Tbilisi), local only

Owner: Codex, branch `fix/selected-match-freshness-v112-20261108`, based on
production v112 source `8c629404406d875550c1ea2057a3aa1c5624dafb`.
Reviewed application file SHA-256:
`5bfcbfbc3ae31b38e6633f0f2c106e76b290f79a35c8a82792ec08428eca2dcb`.
The base checkout remains unchanged. This local repository has no configured
remote; the provided exact source commit was used without a remote-head claim.

Only the existing SelectedMatches component and its regression tests change
application behavior. The panel is not replaced. API/backend code, shared status
helpers, TodayMatches, favorites storage, CSS, transport and polling cadence are
unchanged. The existing guarded response update now also synchronizes the
presentation clock, so a genuine response between 15-second ticks is not falsely
classified as future evidence.

LIVE/halftime labels and emphasis require non-stale status evidence no more than
two minutes old, no future date, and an online presentation state. Aging, fetch
failure and an offline event retain the last confirmed score. Confirmed FT and
other non-live status meanings remain intact. Explicit statusStale:false remains
independent from appointmentStale/error. Ambiguous legacy checkedAt cannot prove
score freshness; fetchedAt remains supported. Invalid/future incoming status
cannot replace a confirmed score or block later genuine recovery. Completed cold
status failures show unavailable, not perpetual loading. Provenance includes the
full observation date/time in Asia/Tbilisi, with invalid/future dates explicit.

Verification on the final source:
- 119 new deterministic helper/actual-component hook checks passed, including
  exact age boundaries, legacy provenance, timestamp rejection/recovery, retained
  scores/FT/appointment warnings, delayed-response clock synchronization, offline
  transitions, polling, navigation callbacks, expansion, removal and late cleanup.
  Existing selected-panel, provenance, connectivity and race suites also passed.
- Independent Codex review found no blocking issue. The reviewer ran 47 separate
  assertions plus the 119 component, 34 connectivity and 11 race checks. This was
  an actual separate review, not a Claude review or a self-review.
- TypeScript and production build passed. The existing large-chunk warning remains.
  New-test lint passed. Changed existing files retain exactly their baseline rule,
  message, node-type and count findings: component 14 errors/1 warning, existing
  CommonJS test 10 require-import errors. General lint is not clean.
- Final full regression: 68 of 70 suites passed, with identical application-file
  SHA before and after the run. Earlier full candidate runs had the same two
  failures. A clean full pass is not claimed.
  `daily-strip.cjs` fails its fresh-card assertion on unchanged v112 too: it mocks
  Date.now but not new Date(), so real Tbilisi day rollover excludes its fixed
  7 November fixture. An external diagnostic wrapper freezing both clocks passes
  its 45 checks. Neither that test nor TodayMatches was edited here.
  `calendar-rate-limit.cjs` fails the 32-request latency assertion in this checkout
  (diagnostic: 30 requests, Bundesliga2 error, four concurrent requests, 16 simulated
  seconds). Baseline v112 passed four isolated runs and its full run; the current
  isolated run still failed. All 45 locally loaded calendar modules are byte-identical
  to baseline and do not import SelectedMatches. Its scheduling/deadline cause is
  unresolved; it is not labelled a proven new regression or dismissed as flaky.
  Baseline full result was 68 of 69, failing only daily-strip.
- Isolated actual-browser QA passed desktop and CSS widths 320/390. Final-source
  reruns cover delayed responses without a clock tick, age, recovery, offline/online
  and FT, with inspected screenshots. Actual Home/FavoritesProvider dialog open,
  close/reopen, navigation/Back, selection, expansion and reload persistence were
  tested on preceding revisions; the bounded final changes were rechecked separately.
  The entire browser matrix was not rerun wholesale after each small correction.

Browser responses and storage were synthetic and isolated. No real backend/provider,
OS-level outage, mobile touch device or global-app freshness guarantee is tested.
TodayMatches can still display recent LIVE during an offline-only transition until
its separate age/fetch-failure rules run; that surface is unchanged. No publication,
GitHub push, production request/mutation, secret, data, access or setting change
occurred. Next owner: release coordinator to consider the remaining aggregate-test
failures and obtain separate publication approval. This is a local patch, not a
released fix or a clean full release gate.

## Daily strip status provenance — 7 November 2026, local only

Owner: Codex, branch `fix/daily-strip-freshness-v111-20261107`, based on
production v111 source `ae75e449f58719c9929bb50f89fde29b82186909`.
Only the TodayMatches strip and its scoped presentation changed. My Matches,
calendar routes, provider behavior, shared status helpers and other functions
are unchanged. The response-level calendar checkedAt is an attempt timestamp,
not proof of a successful score snapshot. It is now labelled as an attempt.
Cards show the per-match confirmed observation date/time in Asia/Tbilisi.

LIVE emphasis requires non-stale status evidence no older than two minutes,
with no future timestamp. A local clock ages cards without waiting for network
responses. Stale live status becomes unknown, retaining the last known score;
confirmed finished status remains finished. Missing/invalid dates are explicit.
Serial polling and abort guards prevent overlapping/outdated responses. A
partial HTTP 200 fallback cannot roll back a newer local score or remove a
confirmed current-day fixture from a failed league. Successful calendar results
can still remove fixtures. The Tbilisi day filter remains authoritative.

Verification: 45 synthetic helper, real-component hook and SSR assertions cover
stale/fresh live, finished/scheduled controls, invalid/future timestamps,
partial fallback, transport failure, slow polling, cleanup and day rollover.
TypeScript, new-helper lint and production build passed. The existing bundle
size warning remains. Exact base comparison finds no added TodayMatches lint
rules: existing any/Crest effect/image/dependency findings remain. Initial full
regression stopped at the known calendar-rate-limit timing assertion; a second
complete run passed all 69 suites. The final full-suite run passed 68 of 69 suites, again failing only that timing
assertion. It is not a clean full pass. After the last future-timestamp recovery
guard, all 45 focused checks, TypeScript and helper lint passed again.
Independent review identified partial-fallback rollback and future-first recovery
bugs; both were corrected and independently rechecked with additional actual
component/mock-hook recovery tests. No remaining blocking review findings.
Desktop/mobile visual verification remains unavailable.

Chromium visual QA is blocked by `socket() Operation not permitted`; no actual
desktop/mobile rendering or screenshot is claimed. An SSR preview is available
locally at `/tmp/cardroom-daily-strip-qa.html`, generated only from synthetic
fixtures. No publication, push, access change, credential, provider request or
production mutation occurred. Next owner: release coordinator, after separate
publication approval and desktop/mobile visual QA.

## Workers-compatible OAuth redirects — 7 November 2026, local only

Owner: Codex, branch `fix/drive-manual-redirect-v110-20261107`, based directly
on the v110 source `3adb52ba5ae158fb1eb5ebad06be7ad0e12c42e9`.
Cloudflare does not support Fetch's `redirect: error` mode and throws TypeError
at Request construction. The four-line runtime diff uses supported `manual`
mode and rejects every 300–399 response before reading its headers or body.
It never follows Location. Fixed `google-{stage}-redirect-refused` errors retain
the five-minute persisted cooldown; previous confirmed connections are kept.
Reference: https://developers.cloudflare.com/workers/runtime-apis/request/

The change preserves fixed Google URLs, scope, owner/Origin checks, no-store,
AbortSignal/timeouts, body limits, credential encryption and no-retry behavior.
No environment, access, schema, upload or other runtime feature is changed.

Verification: all 68 suites passed sequentially, including 1,476 OAuth checks,
49 page checks and 270 new native-workerd checks. The new suite runs the actual
production module with real isolated D1 and intercepts every outbound request.
It covers successful grant storage/readback and 20 token/account redirect cases;
the unit suite covers every status 300–399 at both stages. Copied-source mutations
to error or follow mode fail the runtime suite. All fixtures are synthetic.
TypeScript, implementation-file lint, diff checks and production build passed;
the existing large-chunk build warning remains. Independent security review
found no blockers and reran all three focused suites.

No publication, production mutation, credential access, real Google request or
OAuth retry occurred. This validates runtime compatibility, not real Google
credentials or off-site protection. Next owner: release coordinator to obtain
publication approval, preserve current settings, then check saved outcome and
cooldown before continuing the separately authorized connection flow.

## Redacted OAuth transport diagnostics — 7 November 2026, local only

Owner: Codex, branch `fix/drive-oauth-diagnostics-v109-20261107`, based directly
on the v109 Sites source `500b2568e53bab2b3bfc40b504faa3c4ebded4ea`.
Unexpected Google transport exceptions now produce a finite diagnostic code:
`google-{token|account}-{fetch|response|body}-{category}`. Categories are
`deadline`, `type-error`, `abort-error`, `timeout-error`, `error` or `unknown`.
Only the local abort signal and a guarded, exact allowlist of exception names
are inspected. Messages, stacks, causes, URLs and provider payloads are not read
or logged. The code is returned through the existing owner-only error response
and persisted in existing `last_error`; the browser still receives a clean,
generic failure redirect. No new endpoint, status field or schema is added.

Existing safe HTTP/validation errors and the five-minute unexpected-failure
cooldown are unchanged. Scope, owner/Origin checks, fixed destinations, rejected
redirects, response/time limits, token persistence and no-retry behavior remain
unchanged. A type-error label does not prove a network or credential problem;
these codes locate a future failure, not the cause of a previous generic one.

Verification: all 67 suites, TypeScript, implementation-file lint, diff checks
and production build passed. Focused suites cover 274 OAuth and 49 page checks,
including both Google stages, fetch/response/body exceptions, trusted deadline,
hostile names/getters and secret sentinels. Independent review found no blockers
and independently reran the focused suites. The existing large-chunk build
warning remains. No live browser/provider test or successful OAuth is claimed.

No publication, live mutation, credential change, OAuth retry or file transfer
occurred. Next owner: release coordinator to consider this exact diagnostic
patch, obtain publication approval and check stored outcome/cooldown before any
separately authorized fresh OAuth attempt. Do not automatically retry a grant.

## Drive form Origin correction — 7 November 2026, local only

Owner: Codex, branch `fix/drive-form-origin-v108-20261107`, based directly on
the verified v108 source mirror `34d86f11bb77e6e90c81e0fff888130e75704c60`.
No later draft upload, exact-score or diagnostics changes are included.

The owner HTML now uses `Referrer-Policy: same-origin`, so its native form POST
preserves the Origin required by the unchanged server validation. The prior
`no-referrer` policy produces `Origin: null` for this navigation under the Fetch
standard. Shared result headers, Google redirects and callback redirects retain
`no-referrer`; no null-origin exception, scope change or credential change exists.

Verification: all 67 suites passed sequentially, including 49 page checks and
92 OAuth checks; TypeScript, implementation-file lint, diff checks and production
build passed. Independent review found no blocking issue and independently reran
both focused suites. The two existing CommonJS test files retain their baseline
ESLint require-import findings; general lint is not claimed clean. The build
retains its existing large-chunk warning. Browser reproduction could not start:
installed Chromium failed with `socket() Operation not permitted`, including one
escalation attempt. No browser/live flow success is claimed.

No publication, production changes, credential generation, OAuth grant or upload
occurred in this fix. Next owner: release coordinator to obtain publication
approval, publish only this v108-based change, then verify the owner form in the
real browser before continuing the separately authorized Google consent flow.


## All-leagues daily list (local candidate, 8 November 2026)

Based on Sites v117 (`a9972cc7dcebba994e939ec3f32a62a527df8854`). Adds a collapsible “Все лиги” list using existing daily calendar state, with Tbilisi times, all statuses and explicit per-league coverage. No new provider calls on toggle and no publication. See `docs/today-all-leagues.md` for scope, verification and integration limitations.


## Preserved GitHub source-sync history

## GitHub source sync — 7 November 2026

Owner: Codex. This increment mirrors published Sites v108 source
`ab21b210cbd9bbad617cd8799ff93a480d45c91e` onto the existing PR #7 branch,
whose previous GitHub head was `ceda5ab4f3440ea4687f18d0ea3910890065edbb`.
It includes all 16 leagues, the portable-archive preparation, and the locked
Drive connection page/OAuth foundation. GitHub-specific reliability notes and
CI are preserved; generated build state, runtime exports and credentials are
excluded. Exact-score 1:1 is a separate experimental review branch, not part of
the published v108 source. Its original source commit is
`0ee3e4d5283b4d9b2bd1b185b9254f1f5f0a83bc`.

The older sections below are chronological implementation notes, not current
deployment/configuration claims. v108 is already published; this GitHub sync
does not publish another version, merge main, migrate live D1 or refresh data.
The owner setup page still reports owner configuration missing. The existing
CARDROOM Backups Drive folder was read on 7 November and is empty. No OAuth
connection, archive upload or external recovery is claimed. Do not configure
an owner from a screenshot identifier alone or commit that identifier/secrets.

Verification: all 67 regression suites, TypeScript (no incremental output),
and production build passed. The existing >500 kB chunk warning remains.
Independent Codex review found no blocker for this GitHub-only sync and checked
secret exclusion, 16-league propagation, disabled Drive and additive schema.
The resulting GitHub commit and remote CI status are recorded in PR #7.
Browser QA and real Google authorization remain unverified by this sync.

## Drive connection page — approved locked release, publication pending

Owner approved implementation and publication in this conversation. Adds
`/backup-drive` with server-side owner authorization, native POST consent action,
strict no-store/no-referrer/CSP, no JS and no secret inputs. Anonymous viewers
can sign in through Sites. Until owner configuration exists, signed-in viewers
see only their own trusted Site identity and explicit no-auto-enrollment text;
no connection/storage access is allowed. Callback success AND failures navigate
to a fixed clean page URL, never reflecting OAuth queries/provider payloads.

Google client creation and old exposed secret revocation were confirmed by the
owner's screenshots; the new secret is not provisioned to Sites. Runtime env
revision 0 has no entries. OAuth stays disabled. No folder grant, upload, external
backup, schedule change, personal-mail access or Google token exchange occurred.
User must establish genuine Sites identity and use a supported private secret
entry mechanism before enablement. Platform callback-query log safety and actual
identity/cookie Google roundtrip remain enablement gates.

Independent Codex review found no blocker to disabled publication. Added tests
cover stored/expired/unknown states and prevent inconsistent status from enabling
the form. Focused page: 43 checks; OAuth: 90 checks; TypeScript passed. Initial
full regression run hit the existing calendar rate-limit timing assertion while
build ran concurrently; standalone repeat passed all 19 checks. All 67 suites
then passed sequentially (exit 0). Final production rebuild is part of packaging.
Existing >500 kB bundle warning remains.
Managed browser preview is unavailable: vinext reports another /site server,
PID 14; no process was killed and no alternative server launched. Desktop/mobile
visual QA and real Google consent are NOT claimed.

Pre-release live v107 health is HTTP 200/degraded with readable storage; summary
revision `3c7a9533-534b-4881-aff6-ead95f016b6d`, lastAttempt 15:30:44.964Z.
EPL referee report was already overdue before this release. Other source/coverage
alerts remain; no update endpoints were called. Post-release evidence must be
recorded separately, not inferred from successful build.

## Drive OAuth foundation — local only, not connected

Owner: Codex, branch `feat/backup-drive-oauth`, base `178fd8d` (portable archive)
on live v107. Refreshed Sites `main` still equals `d2f1dad`. Adds disabled-by-default
owner-only start/callback/status routes, cookie-bound one-use D1 state, PKCE,
account/scope validation and encrypted refresh-token storage with revision
readback. Schema-only migration adds two separate OAuth tables; football journal,
live recovery, sources, My Matches and schedules are unchanged. See
`docs/backup-drive-oauth.md` for exact configuration, planned callback and gates.

No real OAuth client, secret, encrypted token, external archive or background
backup has been created by this code. The Google console configuration was done
by the owner; Web client creation is paused. Connection UI, folder grant via
Picker, uploader, independent archive key and real restore remain pending.
External/Testing has a seven-day credential limit. Do not publish, change runtime
configuration or claim working off-site protection without explicit approval.

Independent Codex review (not Claude) identified a callback cookie race and
unverified cooldown writes; both were fixed and independently rechecked. No
remaining review blocker for this local-only foundation. Validation: all 66 test
suites passed in the regression run; after review fixes, focused OAuth (90 checks)
and archive credential-exclusion (22 checks) passed again. TypeScript and the
production build passed; the existing >500 kB JavaScript chunk warning remains.
No UI changes or browser/real-consent QA
claims; publication and live configuration remain explicitly gated.

## Portable archive v2 — local preparation only

Owner: Codex, branch `feat/backup-export-v2`, based on published v107
`d2f1dad3f0a5aeb359cf0209cdade328331a9355`. See `docs/archive-v2.md`.
Fixed read-only capture covers summary + 16 referee reports and both published
D1 journal tables, including all observation revisions. Offline drill restores
only into in-memory SQLite. No routes, production writes, schedules, external
accounts or live exports were added. Existing v105 backup contract is unchanged.
The exact-score experiment remains separately committed on its own branch.

Independent Codex review found and verified a fix for oversized D1 transfer.
The focused archive suite passes 21 checks; legacy backup (35) and journal (61)
checks, all 65 test suites, TypeScript and production build pass. Build retains the existing >500 kB
chunk warning. No UI changes or browser QA claims. Real production capture,
external storage/key custody, retention policy and isolated Cloudflare recovery
remain release gates. Do not publish or claim off-site protection yet.

## Domestic expansion (in verification)

Owner: Codex. Adds Serie B, Championship, Ligue 2, Eredivisie and 2. Bundesliga (16 total; existing Bundesliga retained). ESPN 2026 standings identity and team counts were read directly: ita.2/3931/20, eng.2/3914/24, fra.2/3926/18, ned.1/725/18, ger.2/3927/18. Calendar/detail/journal routing uses the existing ESPN adapter. No new provider or invented season-summary/referee statistics: these remain null until a source is verified. Missing summary sources are not fetched; hourly appointment reports still persist with explicit statistics-unavailable status.

Backup scope intentionally remains the original v105 summary + 11 referee reports (12 records), preserving existing verified copies. The five new referee reports and D1 journal are NOT covered. A versioned backup migration and external copy remain pending; do not change the old 12-record requirement to imply new coverage. Existing tasks enumerate the API league list; literal 11-league monitoring text needs a subsequent coordinated update. No schedule has been changed.

Local preview QA blocked by an existing dev-server lock reported by the managed preview daemon; no process was killed. Current tests/build/publication evidence must be recorded after verification, not inferred from this note.

## Results journal increment

Owner: Codex. Baseline Sites v105 / source `2df5a7836e9d4aa22c90342c33d3bd988f88ae50`.
Adds D1 append-only pre-match snapshots and normalized observed match outcomes, shared scenario computation and `/results` UI. See `docs/results-journal.md` for eligibility, scoring and backup limitations. No retrospective model performance is fabricated. The new journal is not covered by the existing R2 recovery report.

Local and live release evidence, exact version and GitHub source identity are recorded in PR #7 after verification. Independent Claude/human review is still pending; do not describe self-review as independent review.

## Current maintenance scope

Baseline: Sites v103, source `76a4dd2376f77be3a1ce0504afa4e1208a23a6da`.
GitHub review branch: `sync/sites-v103-20261106`, PR #7; do not merge without approval.

This increment adds shared agent instructions, a PR checklist, an operational runbook, a read-only `/api/health` endpoint and rate-limited redacted cache failure logging. No provider changes, data migration, access changes or new subscriptions.

## Local verification

- Existing test suites completed successfully; the added operational-health suite passes 30 checks.
- TypeScript check passed with incremental output disabled.
- No UI changes; no new browser visual QA is claimed.
- Production build, exact published version and post-deploy probe are recorded in the release handoff/PR after completion. This source document does not claim a deployment before it occurs.

## Confirmed baseline failures

- Eight league statistics feeds share ValueStats, with recorded HTTP 403/backoff.
- UEL and UECL had no successful statistics snapshot and 18 missing appointments combined in the 6–12 November checked window.
- Bundesliga statistics rejected an unconfirmed season; last successful snapshot 1 November.
- Primeira statistics use a manual 16 October snapshot.
- A stored report with persisted=true is not proof that its upstream data is fresh.

The existing hourly task was re-enabled on 6 November. Its next successful unattended execution must be confirmed from recorded run history, not inferred from this document or a manual pass.

## Daily recovery increment

This increment adds daily summary/referee checkpoints, seven bounded slots, SHA-256 verification and an isolated-copy recovery drill. Baseline is Sites v104 (`e739c92e65892c15ee4468189c5a80044337a6de`). No live restore or raw-data export endpoint is added. See `docs/recovery.md` for exact limits. Release evidence is recorded in PR #7 after verification.

Runtime backup suite: 35 checks passed; TypeScript passed. The v104 GitHub workflow completed successfully, including its responsive audit. This does not substitute for the current commit's CI. Next task: confirm an unattended scheduled run and assess an independent watchdog before expanding source coverage.

Independent review and approved source coverage evaluation remain pending. No Claude review has yet been performed. Do not represent any old audit's paused-network state as current without rechecking.
