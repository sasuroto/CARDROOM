# Tournament summary and referee table status

Owner: Codex. Local candidate branch `fix/summary-status-20261108`, based on
published Sites v118 source `8a17106295c16c6d880f66381a62add0fda84eda`.
No publication, push, provider request, production data write, schema, API/query,
dependency, credential, setting or schedule change is part of this candidate.

## Bounded behavior

The tournament summary now has an always-visible status strip immediately before
its figures. Overview, Cards and yellow-card summary each retain their own
successful source timestamp, source link and sample size. Unknown sample size
is explicit. Missing, unavailable, saved/manual, stale, partial and fresh states
use the existing classifier precedence. The extraction in `lib/data-health.ts`
does not change its output. The presentation rejects invalid/future source dates
as unknown without changing the saved numbers. A recent page load, attempted
refresh, global health report or team snapshot cannot renew aggregate evidence.
The redundant raw overview date link in the table now says “Источник”; its
validated original date is in the visible strip.

Yellow aggregate coverage is not team-table coverage. A derived aggregate can
use a team's partial flag only when explicit derivation, source and snapshot date
match. Manual mode requires explicit derivation and matching source. Segunda's
standalone aggregate uses its own date, N, source and yellow-summary error. No
full-coverage assertion is added where aggregate coverage is unknown.

A local one-minute timer rerenders age labels only. The actual render clock
validates dates, including a newly received snapshot or league navigation before
the next tick. The timer never fetches or changes successful timestamps and is
cleared on unmount. Numeric values, formulas and table filters are unchanged.

Empty referee source rows no longer claim a partial collection or saved rows.
An unavailable source with existing rows retains those rows and their date.
Source-empty, dated-empty and filter-empty states remain distinct. Missing,
invalid or future dates say that the successful snapshot date is unconfirmed.
A newer statistics failure is distinct from appointment failures. Nothing in an
empty season table implies that a referee has not been appointed to a match.
Existing My Matches, All Leagues, Scenario 1:1 and collapsed service details remain
unchanged.

## Validation

- `tests/summary-presentation.cjs`: 140 offline assertions covering classifier
  parity, per-block provenance/N, standalone Segunda coverage, source failures,
  unknown/invalid/future dates, real-zero preservation, immutable inputs, actual
  React components, actual Home navigation/filter handlers, late arriving data,
  timer aging and timer cleanup. No fetches are permitted in this focused suite.
- Existing QA: 408 assertions passed after the final source-link adjustment.
- Final sequential full suite: all 82 suites passed on the final production code.
- TypeScript without incremental output passed.
- New helper/components/test ESLint passed. Changed existing files match the v118
  baseline: `app/page.tsx` has 33 errors and one warning; `lib/data-health.ts` has
  four errors. This is not a repository-wide lint-clean claim.
- Production build passed with the existing large-chunk warning. Dependencies
  were reused unchanged; Cloudflare metadata fetching was disabled.
- Independent code review found and verified the Segunda coverage correction.
  Reviewer checked full dataHealth output parity against v118 across 72 matrices
  and reran relevant health, refresh, referee and actual-page tests. Exact final
  commit review is pending.
- Desktop/mobile browser review is a separate step coordinated by the release
  owner. This document does not claim full-app browser, live backend, device or
  production verification.

Build artifacts and test logs remain ignored, local files. The Home stylesheet is
`dist/client/_next/static/css/index.B63Qdket.css`, SHA-256
`68bde7827a49e424ecca464b1512b1c1247f9bafb801cbc9d030bffac87f3da5`.
Next owner: release coordinator for exact-commit review, desktop/mobile browser
QA and compatibility review with the separate calendar candidate. Publication is
not automatic.
