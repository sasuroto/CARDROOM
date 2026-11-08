# All connected leagues in today's matches

## Scope and source

Local-only candidate based on Sites v117, source `a9972cc7dcebba994e939ec3f32a62a527df8854`, checked on 8 November 2026. No publication, remote push, provider changes, scheduler changes, permissions changes or data migration.

The “Все лиги” button in “Сегодня на поле” expands a chronological vertical list of today's fixtures across the 16 connected leagues and tournaments. Day boundaries and kickoff labels use Asia/Tbilisi. Each row includes the league, team names, kickoff, status, known score where applicable, and status provenance. Completed, live, upcoming, postponed and cancelled fixtures remain visible. Missing scores are not converted to zero.

The original carousel, favorite store and match dialog are retained. The list receives existing `TodayMatches` state. Opening, closing or reopening the list makes no additional request. Existing calendar polling, refresh and per-match detail behavior are unchanged.

## Honesty and limitations

Coverage is derived from the existing `/api/matches` response's explicit `competitionIds` and `errors`, not inferred from HTTP success. The panel shows received/total coverage and a per-league breakdown, distinguishes unknown coverage from empty source results, and preserves existing saved events on source failure. Freshness and stale LIVE handling reuse existing status-evidence helpers. Coverage counts mean calendars were received, not that every worldwide fixture is present. Empty source data is not proof that no games exist.

This does not add new source coverage or fix upstream gaps. Provider quota is unchanged by the list toggle. Live API correctness and availability were not probed as part of this work.

## Verification

- Full sequential offline suite: 80 test files passed; new list suite has 45 checks. Existing daily-strip suite has 49 checks.
- TypeScript with incremental output disabled, focused ESLint, production build and whitespace check passed. Existing build warnings remain.
- Independent read-only review found no blocking regression. Accessible row labels were updated to include the visible score and league.
- Browser QA used the real `TodayMatches` component and `FavoritesProvider`, production CSS, and a local synthetic-data harness. CSP denied outgoing connections. Desktop (1165/1180 px), 320 px and 390 px layouts were checked with no page-level horizontal overflow. Long team names wrapped. Favorites synchronized between carousel and list. Match dialog opened and closed while preserving the expanded list. Toggle close/reopen did not increase the synthetic request count. Partial coverage, full fetch failure, stale LIVE and empty data states were checked.
- These checks do not claim full-homepage SSR, live-provider end-to-end verification, physical-phone testing, or post-deployment verification. Managed local preview was stopped after QA.

## Integration

Runtime files: `app/today-matches.tsx`, `app/today-all-leagues.tsx`, `lib/daily-list.ts`, and scoped `.dailyAll*` rules in `app/globals.css`. Regression test: `tests/daily-all-leagues.cjs`.

The parallel match-fields candidate changes different runtime files. Preserve both candidates and rerun integration checks after combining them. `docs/handoff.md` may require a simple append-only merge. Publishing still requires a separate authorized release step and current-source reconciliation.
