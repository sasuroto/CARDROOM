# Standings snapshot guard — local review, 8 November 2026

Owner: source reliability worker. Branch `fix/preserve-source-snapshots-20261108`.
Base: verified Sites v115, source `640516c6c5c17e633ce5aee951fc53f6ee17b23e`.
The Sites deployment of this base was confirmed successful. This patch has not
been pushed, merged, saved as a Site version or deployed.

## Defect and acceptance policy

The base parser accepted `children: []` and empty `standings.entries`, gave them
an up-to-date `checkedAt`, and saved them over the previously populated table.
A shortened table or newly missing numeric fields could also replace good data.
The old `league-team` test explicitly treated the empty result as valid.

Empty tables now fail parsing. Before returning or saving a standings snapshot,
the loader validates competition/season/source identity, the observation date,
team-directory consistency, unique team IDs, all numeric standings columns,
match/goal arithmetic and the configured 2026/27 team count. Source ranks and
points remain source values; zeroes and points deductions are not inferred.
The same policy checks saved records before their TTL is trusted. Invalid legacy
records are not presented as a confirmed snapshot and are not deleted.

For 2026/27, the declared competition format requires 18/20/22/24/36 teams as
configured. Other seasons have no inferred expected count and expose
`coverage.complete: null`, with a visible warning. Every season still rejects
empty/invalid rows and regressions against an already known snapshot. A cold
historical response can still be incomplete without enough evidence to detect
it. This patch does not claim verified historical completeness.

A same-season response cannot remove a known team or reduce its games played.
This conservative rule can retain an older snapshot after a genuine official
correction; such a change needs review rather than silent replacement.

## Failure, freshness and concurrency

A rejected response leaves previous rows and `checkedAt` intact. The API returns
safe `failureReason`, `attemptedAt` and `nextCheckAt` metadata, never raw provider
exceptions. A first incomplete response yields no confirmed table and no invented
success time. A valid later response clears prior failure metadata.

The cache compares persisted candidates with the known snapshot before accepting
them, checks again after source I/O including failed I/O, and remembers accepted
R2 reads. A newer timestamp alone cannot legitimize regressed data. Provider
cooldown prevents source calls but permits reading another writer's newer valid
R2 snapshot. HTTP 403/429 handling and the fixed source allowlist are unchanged.

This reduces observed races, but is not a distributed compare-and-swap lock.
A write can still race after the final read. R2 is still an optional cache; the
existing writer warns on write failure and does not prove durable readback.
This patch does not reconstruct snapshots already erased before deployment.

Source stamps distinguish the time of confirmed table data from a failed attempt
and the earliest next check, in Asia/Tbilisi. Team profiles use the same component
but retain different semantics: their timestamp is labelled “profile assembled”,
not a new confirmation of potentially retained schedule data.

## Verification

- New deterministic offline suite: `node tests/standings-snapshot-guard.cjs`
  (50 assertions), including empty/short/malformed responses, unknown historical
  completeness, old saved corruption, timestamp honesty, source cooldown,
  recovery, concurrent R2 changes and subsequent storage failure.
- Existing parser tests retain identity/season checks with nonempty fixtures;
  the team-profile fixture now supplies a full current-season table.
- Independent review identified cache-read monotonicity, cooldown freshness and
  shared-profile timestamp issues. All were corrected and given regressions.
- Desktop and 320/390px component layouts were inspected in the supported browser
  preview, using exact SSR SourceStamp markup and application styles. Labels wrap
  without horizontal overflow. This was an isolated static fixture with CSP
  blocking external requests, not a full app or production interaction test.
- All 75 regression suites passed sequentially against the final runtime files.
  TypeScript (`--noEmit --incremental false`) and the production build passed.
  The build retains its existing large-chunk/classification warnings. The new
  test's ESLint and `git diff --check` passed. Repository-wide lint was not rerun
  and is not represented as clean.
- Independent review passed 10 additional adversarial checks and five mutation
  controls: removing each of the cache monotonicity, cooldown read, failure reread,
  accepted-R2 memory or profile-label guards makes its regression test fail.

No production provider call, runtime refresh, data import, migration, credentials
configuration, access change or schedule change is part of this patch. Source
repository access was used only to open the current base locally. Existing
parallel branches and their worktrees were not edited.

## Handoff

Next owner: release coordinator. Integrate the reviewed local commit with the
parallel period fix, recheck the exact combined source and run the release gates.
Refresh the current remote/Sites head before considering publication. Missing
statistics providers, blocked access and never-confirmed tables remain separate
source-coverage work; this patch prevents data loss and false freshness but does
not manufacture or recover that missing data.
