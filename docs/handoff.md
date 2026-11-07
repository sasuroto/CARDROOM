# CARDROOM handoff — 2026-11-06

## Manual Drive upload HTTP boundary — 7 November 2026, local only

Owner: Codex, branch `feat/drive-upload-route-local-20261107`, based on draft
PR #11 commit `7add27bb08d5e31f50ef687fc4f712a2a4f2207d`. That PR's remote CI
passed install, TypeScript, tests, build and responsive audit. This HTTP increment
is separate, has not been pushed or deployed, and is not covered by that CI run.

Adds a strict owner-only POST wrapper around the reviewed uploader. An explicit
single-action JSON body, trusted Sites identity and exact origin are required.
Body bytes/chunks/time are bounded. Every other HTTP method is explicitly denied;
unauthorized and malformed requests cannot reach storage or providers. Response
projection, fixed reason allowlists, private/no-store, CSP/no-referrer and no CORS
avoid leaking payloads, secrets or unexpected runner fields. Default configuration
still denies upload. No new UI, schedule, credential entry or access setup exists.

Focused HTTP boundary tests: 122 checks. Existing upload/recovery: 93 checks.
TypeScript, targeted changed-file lint and production build pass, as does the
final sequential aggregate of all 74 suites. Independent security review found
no blocker. Its additional enabled synthetic integration ran all 93 uploader
checks through the real HTTP boundary, including five 201 successes and one
200 duplicate, with fake Google and real in-memory SQLite. The reviewed route
and test file hashes match this local source. No real access was involved.
No browser/live Sites identity QA or real Google transfer is claimed. Required
next steps remain secure owner/client/key provisioning, explicit folder grant,
approved route/migration publication and an isolated real recovery test. Creating
or configuring persistent access and keys requires the applicable confirmation.

## Bounded Drive upload preparation — 7 November 2026, local only

Owner: Codex, branch `feat/drive-backup-local-20261107`, based on PR #10 commit
`22158260b86efa3b35ddde08afbf208f5f9ff620`. See
[backup-drive-upload.md](backup-drive-upload.md). Adds a disabled, unexposed
server implementation for a single encrypted upload to an explicitly configured
private Drive folder, independent key custody, strict drive.file/account checks,
bounded two-pass observed-stability capture, persistent upload intent/leases,
readback verification and an offline encrypted SQLite recovery drill. The new
schema-only migration affects upload telemetry only. There is no live route,
schedule, retention deletion, provider request, real secret generation, OAuth
grant, upload, production migration, deployment, push or main merge.

A successful transfer is not an atomic snapshot or verified production recovery.
The 2 MiB plaintext cap fails closed; all 17 R2 records and the detected v2/v3
journal schema must be present and unchanged across both capture passes.
Credentials, operational state and source-provider refreshes are excluded.
Uncertain create outcomes retain the same preallocated ID; only a confirmed
pre-send failure permits a new attempt. Capture deadlines cannot cancel an
already-running platform R2/D1 read, but prevent all continuation reads/upload.
SQL byte accounting now inspects the bounded ordered row prefix only.

Independent Codex review identified key-encoding equivalence, unbounded awaited
capture/SQL sums, and two known-pre-send failure paths that incorrectly became
uncertain. All four P2 findings are corrected with regression tests; the final
independent recheck confirmed them closed. No Claude review is claimed.
Focused upload/recovery suite: 93 checks, including all three populated journal
tables, original payloads, credential exclusion, account/folder restrictions,
corruption, 403/429, timeouts, concurrency, reconnect, readback loss, key aliases,
and standalone offline recovery. Archive v2: 22 checks; v3: 41 checks. TypeScript
and targeted changed-file lint pass. Two earlier aggregate runs passed all 73
suites. The final-code aggregate encountered the existing calendar-rate-limit
timing assertion; its standalone repeat passed all 19 checks, and all remaining
64 suites passed. Every final-code suite passed, but that interrupted aggregate
is not called clean. Production build passed with the existing >500 kB chunk
warning. General repository lint retains existing findings and is not claimed
clean. No UI changes or browser QA are claimed.

Next owner: release coordinator for explicit approval of secure configuration, per-file folder grant, one real test upload
and independent isolated Cloudflare restore. Publication, live migration and
existing-maintenance integration remain separate approval gates. Do not present
this local preparation as working off-site protection.

## Exact-score archive compatibility — 7 November 2026, NOT deployed

Owner: Codex, branch `fix/archive-exact11-20261107`, based on GitHub exact-score
review commit `8578437a9bfec0909acc305cace8bb2359df94f0`.
Archive capture now detects the supported journal schema. Legacy schema emits
unchanged v2; migration 0002 emits v3 covering `journal_exact11` as well as both
original journals. v3 identifies migration `0002_exact_score_11`, not a new Sites
release. The reader and isolated in-memory SQLite drill support both versions.
Unknown journal schemas and invalid chronology/identity fail closed. Both Drive
credential tables remain excluded; original payload strings and checksums roundtrip.
See [archive-v2.md](archive-v2.md) for compatibility, scope and release gates.

No production capture, live migration, Drive connection, upload, schedule change,
provider request, deployment or main merge. Published v108 remains unchanged;
v105 production recovery still covers only its original 12 R2 records. This fixes
the prepared archive's compatibility blocker, not the outstanding browser QA,
runtime fitting-cost assessment, external recovery or publication gates.
Verification: legacy archive suite 22 checks; new real-SQLite archive suite 41
checks (migrations 0000/0001/0002, all three populated tables, original payloads,
digests, credentials excluded, empty exact table, schema race, unknown/generated
columns and tables, chronology, identity, row/byte limits). TypeScript passed.
All 70 suites passed in the first sequential run. The final-code rerun encountered
the documented calendar-rate-limit timing assertion; its standalone repeat passed
19 checks and all remaining suites passed sequentially. Every final-code suite
therefore passed, but the interrupted aggregate is not described as a clean run.
Production build passed with the existing >500 kB chunk warning. Dependencies were
installed from the unchanged frozen lockfile with pnpm 11.25.0 on Node 24.22.1.

Independent Codex static review found a generated-column omission through
`table_info`; this was fixed with `table_xinfo`, hidden-column rejection and a
SQLite regression. Final independent recheck found no remaining blocker for
GitHub-only review; reviewer did not independently run tests/build. No new UI
changes or browser QA are claimed. Generic CI responsive checks do not establish
exact-score desktop/mobile user-flow QA. Next owner: parent release coordinator
for GitHub draft publication and remote CI; production publication remains gated.

## Exact-score 1:1 GitHub review — 7 November 2026, NOT deployed

Owner: Codex. Port of the separately saved experiment
`0ee3e4d5283b4d9b2bd1b185b9254f1f5f0a83bc`, stacked on the v108 GitHub sync.
Model logic, chronology gates and the separate results panel are unchanged.
The additive migration is renumbered to `0002_exact_score_11` and its snapshot
regenerated so it follows, rather than replaces, the existing Drive migration.
No production migration, forecast, provider request, deployment or main merge.

The original audit had zero valid historical paired evaluations; live model
accuracy is not established. The experiment is not covered by v105 recovery.
The prepared archive-v2 capture is fail-closed: after migration 0002 adds the
new table, it rejects the whole capture as unsupported-schema, rather than
silently omitting the experiment. At that review, archive extension was still required; the later preparatory
compatibility work above addresses it locally. Before deployment: complete desktop/mobile browser QA, assess runtime fitting cost and obtain
explicit publication approval. See docs/exact-score-11.md for original evidence.
Independent Codex review found no blocker for a draft GitHub-only PR. Real
in-memory SQLite verified sequential migrations 0000/0001/0002, all five tables,
snapshot ancestry and unchanged existing table definitions. The original model,
UI and focused tests match the saved experiment. Current full test/build results
and remaining release gates are recorded in the separate PR.

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
