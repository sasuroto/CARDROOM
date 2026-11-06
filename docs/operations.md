# CARDROOM operating process

## Ownership

| Work | Implementer | Review focus |
| --- | --- | --- |
| Sources, storage, refresh and diagnostics | Codex by default | Claude/human: provenance, failure cases, race conditions |
| UI, mobile and interaction | Claude by agreement | Codex/human: behaviour, accessibility, data honesty |
| Release | One explicitly assigned owner | Exact source, tests, smoke check and rollback version |

This is a proposed division of work, not an automatic agent integration. Both agents can work on either area. The user chooses purchases, provider agreements, access changes and main merges.

## Task to release

1. Read current Site version, GitHub branch/PR and handoff. Record acceptance criteria and bounded scope.
2. Implement on a task/review branch; never overwrite another agent's work.
3. Add regression tests, run TypeScript and relevant suites, then the existing CI checks/build. Inspect the diff for credentials and generated files.
4. Ask the other agent/human to review the exact commit where available. Record absent independent review honestly.
5. Publish through Sites with unchanged audience. Record version and source SHA; GitHub push alone is not a deployment.
6. GET `/api/health` after deployment. Confirm schema, all 11 leagues and storage readability. Existing provider degradation is not a deployment success/failure proxy: compare against the pre-release baseline.
7. Record handoff. If a release introduces a regression, redeploy the recorded prior known-good Sites version; do not reset the repository or erase production data. Restore compatibility before replaying jobs.

## Read-only monitoring

`GET /api/health` reads only the saved summary and 11 fixed referee-report keys. It makes no upstream requests or writes. Query parameters are rejected.

- HTTP 200 + `healthy`: inspected reports and summary coverage meet checks; not an uptime guarantee.
- HTTP 200 + `degraded`: missing/invalid/overdue reports, stale or partial source data, or source errors. Inspect `alerts`, not just HTTP status.
- HTTP 503 + `unavailable`: storage is unconfigured or at least one read failed. Read failure is not missing data.
- `due` is eligible to refresh, not an outage. `overdue` starts 30 minutes after the hourly deadline. Summary attempt threshold is 6 hours plus 30 minutes. These do not change refresh intervals.
- The endpoint does NOT test write permissions, establish that an automation ran, or cover calendar/live-score/weather/player freshness. Those remain separate probes.
- Empty appointment coverage (zero fixtures found) is not proof of a complete calendar. Coverage counts only the saved window.

Cache read/write failures emit redacted `[cardroom:storage]` warnings, with no raw exception, key or credentials; each operation is rate-limited to one warning per minute per Worker instance. Verified persistence still requires the writer's runId/revision readback.

## Hourly maintenance (existing linked automation; no duplicate)

1. Read the Site and obtain supported temporary access. Send its token only in the same Site's authorization header; never save it or follow redirects carrying it.
2. Read `/api/health` and `/api/referees`. If storage is unavailable, report the blocker and stop writes.
3. Sequentially refresh only due leagues with 60-second timeouts. Read each result back with `read=1`; compare runId and `persisted=true`. On timeout, inspect saved state before deciding whether a later retry is needed.
4. Read `/api/data` twice and compare attempt/status/updatedFields/errors/block dates. Keep the six-hour interval. Then read `/api/recovery`: require today's `backup.status=verified`, `recordCount=12` and `restoreDrillVerified=true`. An integrity failure is separate from source degradation; never overwrite a corrupt backup to silence it.
5. Refresh today's and yesterday's calendars by Asia/Tbilisi date. Respect provider backoff throughout.
   Their `journal` acknowledgements report D1 outcome capture separately. Read `/api/results` for the current two-day period. For at most three upcoming fixtures without a recorded forecast (earliest kickoff first) and at most three finished recorded fixtures with unverified metrics, the existing analysis handler can capture a forecast/statistical report; do not pass custom payloads or add sources. Read the journal back to confirm actual persistence. Skip ineligible predictions rather than force an entry. Keep the existing hourly schedule. The D1 journal is not covered by v105 R2 backup; see [results-journal.md](results-journal.md).
6. Read `/api/health` again. Report new/persisting operational failures with affected league, last successful date and retryAt. Do not turn a partial pass into a success message. Routine successful runs need no notification.
7. Check the automation's recorded run separately. Enabled does not mean executed. This job cannot independently detect its own failure to start: a separate watchdog remains a pending deployment decision.

## Incident response

| Signal | Action | Never do |
| --- | --- | --- |
| HTTP 403/429 | Respect retryAt; inspect permitted alternate source | Bypass access blocks or hammer retries |
| Report overdue | Inspect task history, authorization and persisted runId | Change last-success dates to hide age |
| Storage read/write failure | Preserve cached values; check binding/logs; verify recovery | Seed-replace production data |
| Wrong season / schema | Quarantine response, keep confirmed snapshot, add fixture test | Accept a different season as current |
| Incomplete appointments | Show missing; validate another permitted source | Infer crew from another match |

## Source acceptance gate

For every league/season require sample responses proving fixture IDs, team/date matching, referee roles, statistics definitions and denominators, update latency, null handling, rate limits, availability and permitted use. Test source priority and failure fallback. A provider's marketing coverage is not proof of complete VAR/assistant assignments. No provider purchase/account creation is part of this maintenance release.

## Remaining work (not claimed complete)

- Replace blocked statistics sources; fill UEL/UECL appointments through an authorized source.
- Independent watchdog and calendar/weather/live probes.
- Durable distributed coordination for simultaneous writers (current leases are best-effort).
- Off-site disaster recovery and approved per-key production restore; bounded daily R2 checkpoints and an isolated-copy drill are described in [recovery.md](recovery.md).
- Enforced branch protection, configured independent agent review and confirmed GitHub CI runs.

No uptime SLA is promised until scheduled runs, outage recovery and restore are exercised over time.
