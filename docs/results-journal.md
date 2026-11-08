# CARDROOM results journal

Capture start: 6 November 2026. This is observed coverage, not an archive from the original site's creation and not a complete calendar. No retrospective predictions or fabricated outcomes are inserted.

## Records and automatic capture

- D1 binding `DB` stores `journal_forecasts` and `journal_observations`. Schema changes use committed Drizzle migrations; no request-time DDL, update or delete operations.
- Successful `/api/analysis?id=…&league=…` responses, including fresh cached responses, attempt to record the first eligible pre-match forecast. Existing `/api/matches` responses archive fresh final/cancelled/postponed scores. Final analysis responses additionally archive available statistics. No additional provider fetch is made by the journal writer.
- Only the 11 fixed leagues and fixtures within seven days of capture are eligible. A calendar call processes at most 150 events and reports `limited` when truncated. Records themselves do not expire after seven days.
- The existing hourly maintenance task can call the existing analysis handler for a bounded number of unrecorded upcoming matches and unsettled recorded matches. There is no new scheduler. Capture depends on that task executing or a visitor requesting analysis; no all-fixture coverage or exact-at-kickoff capture is promised.
- Each response includes `journal` acknowledgement. `persisted=true` means a readback confirmed a record, not that all source data are fresh or complete. An existing record is not overwritten. `not-eligible` is not a successful prediction capture. `unavailable` is a storage incident.

## Forecast contract

The UI and archive call the same `buildMarkets` implementation, version `cardroom-scenarios/1`. Archive selection is fixed to the 10 primary market IDs, at least three comparable games per team, fresh provenance and a strictly future scheduled kickoff. The stricter existing DOT selection is recorded as a separate flag, not applied retrospectively. No qualifying forecast means no prediction record.

The snapshot contains model version, team identity, kickoff, selected outcomes, model probabilities, sample sizes, aggregate model inputs, source URLs and actual check times. SQLite's server clock guards the INSERT and records `committed_at`. A primary-key constraint makes the first eligible write immutable across concurrent workers. A late request cannot create a backdated forecast.

This preserves aggregate model inputs, not every raw provider response, news item or lineup. It is not a complete reproducibility archive for external providers. Independent replication of the model remains future work.

## Results and scoring

Score and statistical observations have separate append-only revisions. A hash of normalized facts suppresses identical polls; a newer changed response appends a revision. Old or equal-timestamp conflicting responses do not overwrite current results. A correction A→B→A retains all three revisions. Null remains null; a later missing field is not silently scored from an old report.

Only a confirmed regular-time final with unchanged fixture identity/kickoff is settled. Extra time, penalties, uncertain finals, reschedules and cancellations are excluded; unavailable statistics are unverified, not misses. Statistical reports inconsistent with a corrected score are unverified. Corrected results recalculate outcomes on read but never rewrite forecasts. Provider definitions, particularly yellow-card counting, remain limitations; this is not bookmaker settlement.

`GET /api/results?from=YYYY-MM-DD&to=YYYY-MM-DD&league=all` is read-only, provider-free and returns no-store JSON. Default window: seven days, maximum 31. At most 200 fixtures are returned; `truncated=true` makes statistics explicitly partial. Filtering uses match day in Asia/Tbilisi, not capture day. Stored payloads and permanent history remain on the server outside this read window.

Hit rate uses only settled predictions; unavailable/empty rates are null. Binary Brier uses the selected outcome and is not a full multiclass score. Multiple scenarios from one match are correlated. No ROI, yield or profit is computed without stored odds and actual staking data.

### Stricter evidence checks on existing schema-1 history

Settlement requires numeric `period === 2` and both present team IDs matching the
forecast in home/away order, in addition to the existing final-status, name and
kickoff checks. A missing, null, blank, zero, string or otherwise non-2 period is
not proof of a regular-time final. Missing or mismatched team identity is not
proof of the forecast's fixture. Numeric observation IDs keep the existing
string comparison with saved forecast IDs; this narrow repair is not a general
validator for arbitrary JSON types and does not change ingestion normalization.

Previously stored observations are re-evaluated when the journal is read:
- If the latest status lacks the required period or matching IDs, its picks are
  `excluded` instead of hit/miss. A newer incomplete revision cannot fall back to
  an older complete one for scoring.
- If the latest status is confirmed but the statistical report lacks that
  evidence, goals-based picks can still settle while statistical picks are
  `unverified`. Existing corrected-score consistency checks still apply.
- Confirmed period-2 results with matching IDs retain their outcomes. Forecast
  probabilities, source observations and all correction revisions stay intact.

For the same saved history and filters, incomplete picks leave the settled,
hit/miss and per-metric denominators, including DOT. Accuracy and Brier may rise
or fall depending on the removed outcomes; an empty settled sample returns null,
not zero. Prediction and stored-result counts do not disappear merely because an
outcome is excluded. Actual production row counts and aggregate changes have not
been inspected or estimated.

This is a read-time evaluation correction, not a data migration. Schema version 1,
the model version, stored payload bytes, hashes, timestamps and archive format are
unchanged. No old snapshot or observation is rewritten or deleted, and no missing
period/ID is inferred, repaired or backfilled.

## Availability and recovery limits

`/api/results` returns HTTP 503 for a missing/unreadable D1 journal, not an empty success. Journal capture failure does not discard a successful upstream calendar/analysis response; inspect its acknowledgement. Public HTTP callers cannot submit forecast/result payloads or arbitrary source URLs.

The existing v105 `/api/health` and daily `/api/recovery` cover the R2 summary and eleven referee reports, **not this new D1 journal**. Do not infer its integrity or backup from `recordCount=12`. External disaster recovery, D1 snapshot export and a verified restore drill for this journal remain pending; do not claim full backup. No retention cleanup or production restore is shipped here.

## Verification

`tests/results-journal.cjs` uses actual in-memory SQLite and the committed migration; checks immutable/server-time inserts, revisions, provenance, sample gates, exclusions, nulls, read-only behavior and storage errors. These are local tests, not proof of live data capture. Production release evidence must include a live acknowledgement and repeat journal readback, with actual counts rather than synthetic seed data.

`tests/results-evidence-regression.cjs` checks actual-source settlement and ordinary,
DOT and per-metric denominators with synthetic evidence. `tests/results-history-readonly.cjs`
replays schema-1 history through the real reader and GET handler using isolated
SQLite in query-only mode, checks all saved bytes and metadata, and forbids provider
fetches and write attempts. These checks do not read production records.


## Corroborated period evidence (local candidate)

Some ESPN summaries omit period even when the matching scoreboard explicitly
reports numeric period 2. The analysis route may corroborate this field only
against a fresh, strictly matching scoreboard event/competition. Both endpoint
URLs, receipt timestamps and exact compared identity/score/status facts are
preserved in new observation payloads; the original absent period stays null
in `summaryPeriod`. Explicit malformed, string, extra-time or penalty periods
are never overwritten. Failure to confirm leaves the outcome excluded.

SQL and payload `schemaVersion:1` stay unchanged. New proof-bearing observations
use `digestVersion:2`; their semantic digest omits only the two nested proof
timestamps in addition to the top-level observation timestamp. The shared
`observationDigestFacts` validator is used for writing and archive verification.
All legacy row hashes and bytes remain unchanged. Unknown digest versions or
malformed proof are rejected. Source times must not be future when writing;
historical archive verification checks their consistency rather than current
freshness. Ship the new writer and archive verifier together.
