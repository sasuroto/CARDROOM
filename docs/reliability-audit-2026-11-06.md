# CARDROOM reliability audit — 2026-11-06

## Scope and evidence
Source inspected: Sites v103, commit 76a4dd2376f77be3a1ce0504afa4e1208a23a6da. GitHub review: PR #7.
This is an implementation/coverage audit, NOT a fresh production-data certification.
Sites metadata confirms active v103 and the existing update task is paused.
Direct production API reads remain blocked by the execution environment's previously observed outbound-network policy. A Sites service token does not override that policy. Do not bypass it or change the site's audience.
Committed seed snapshots below are not current runtime R2 records.

## Coverage matrix
All 11 competition IDs have ESPN calendar and standings routes configured. Configuration does not prove successful retrieval, complete membership or persistence.

| Competition | Official appointment adapter in code | Seasonal referee statistics | Main outstanding check |
| --- | --- | --- | --- |
| Premier League | Premier League API / official adapter | Soccerbase | Fresh season-qualified rows and appointment readback |
| Champions League | UEFA appointment page and match crew parser | ValueStats | Full crew completeness per match; provider access |
| Europa League | No dedicated official adapter; ESPN fallback | ValueStats | Official appointments and crew; first confirmed statistics |
| Conference League | No dedicated official adapter; ESPN fallback | ValueStats | Official appointments and crew; first confirmed statistics |
| La Liga | RFEF | ValueStats | Published appointment coverage and statistics access |
| Segunda | RFEF | ValueStats | Published appointment coverage; yellow-summary parser |
| Serie A | Lega Serie A articles | ValueStats | Time-budget/deferred matches and statistics access |
| Bundesliga | DFB schedule | Balonario | Reconfirmation of stale appointments; season evidence |
| Ligue 1 | Ligue 1 articles | ValueStats | Missing/reconfirmation cases and statistics access |
| Super Lig | TFF | ValueStats | Fresh appointments and season-qualified statistics |
| Primeira Liga | Liga Portugal API | Footiqo saved snapshot only | Automatic season-qualified statistics adapter absent |

ValueStats is a single dependency for 8/11 seasonal-referee feeds. It previously returned HTTP 403; this audit does not claim it is still blocked now.
The dedicated UEFA full-crew parser is restricted to Champions League. ESPN role extraction is available but cannot guarantee assistants, VAR, AVAR or fourth-official coverage.
New Europa/Conference seed objects have null summary dates and empty team/referee rows, deliberately not zero-valued statistics.
Other seed blocks include October snapshots; use runtime checkedAt/source/season evidence before displaying them as current.

## Refresh architecture and verified gaps
- Referees: request-triggered refresh, one league per call, 60-minute interval, 45-second work budget, at most 24 matches, saved runId readback.
- Summaries: request-triggered block updates with six-hour success intervals, bounded retries and provider backoff.
- Calendar: date-scoped calls, provider safeguards and retained snapshots.
- Existing cloud updater is paused. These handlers alone do not establish an independent host-level cron.
- Local open-page polling is not unattended refresh.
- Persistent storage: R2 BUCKET. The current manifest has no D1 binding.
- league-data-cache.ts collapses exceptions into generic user-facing errors. This is a diagnostic gap: empty tables cannot be attributed to network, schema, season or persistence failure from that response alone.
- Successful publication and local build do not prove external-source coverage.

## Production log observations
The available error-filtered log slice showed canceled calendar requests and 404 responses for robots.txt/sitemap.xml. Canceled requests from the crawler are not proof of a server crash. This limited log slice does not certify uptime or reveal current table contents.

## Ordered work
### P0 — Restore verifiable unattended access
Provide an approved outbound HTTPS route from the update environment to the exact existing CARDROOM host (port 443), using supported Sites service access. Do not route around policy or publish tokens.
Read /api/referees without triggering a refresh; then refresh only due leagues sequentially and read each result back. Resume the existing paused task only after access and persistence work, with authorization to resume. Do not create a duplicate task.

Acceptance: all due calls return a runId matched by read=1 and persisted=true; today/yesterday calendars return explicit coverage/errors; /api/data metadata and block dates agree on reread. Incomplete source coverage remains labelled partial.

### P1 — Diagnose table and team failures
Preserve a safe structured error category, attempt time, source and last successful date in cachedLeagueData, without disclosing credentials, headers or raw upstream bodies. Add tests for HTTP errors, schema/season mismatches and failed persistence.
Exercise Europa and Conference standings using their configured endpoints after access is restored. Do not assume empty standings mean zero teams.

### P1 — Close appointment and statistics gaps
Verify official Europa/Conference source formats and terms before implementing adapters; match competition, teams, kickoff and official identity exactly. Add fixtures for partial crews, changed assignments, missing names and provider failures.
For the 8 ValueStats feeds, establish permitted reliable access or validate replacement sources. Do not evade 403/429 or buy a subscription without approval.
Primeira statistics need a real tournament/season-qualified adapter; until then retain the dated manual label.
Bundesliga needs valid season evidence, not relaxed validation.

### P2 — Operational verification
Track per-block lastAttempt, lastSuccess, nextCheckAt, status, sample size and error category. Alert on a new sustained failure; avoid repetitive notifications for unchanged known failures.
Run mobile/desktop flows: tournament -> calendar -> favourite -> match -> live result -> provenance; include offline/recovery and postponed/canceled matches.
Observe at least 72 hours of scheduled readback without unreported failures. This is a proposed acceptance period, not a completed test.

## Change-control rules
GitHub branch and PR review precede merge; do not duplicate the My matches implementation from older PRs.
Code publishing, runtime data refresh and browser-local favourites are separate operations.
Never substitute missing values with zero, update successful-data timestamps after failed requests, or label estimates as proven prediction accuracy.

## Decision required to unblock production verification
The environment owner must enable approved network access to cardroom-europe.lush-flute-9375.chatgpt.site:443, or select a supported deployment-side execution path. A new scheduler/platform, paid source or access-policy change requires an explicit decision. No such change was made in this audit.
