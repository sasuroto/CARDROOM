# Combined period and standings validation — local only

Base: exact Sites v115 source `640516c6c5c17e633ce5aee951fc53f6ee17b23e`.
Period input: `0766540bbcfa3e70ce4e256594d2e994fd71f9b0` (including
`7f4b2ae` and `9fac025`). Source guard input:
`f335ec2c719079b66fc263c5860fd3b02a928cad`, applied as its exact bounded
base diff. The sole cleanup is whitespace in the new standings test.
No backup/1:1 branch content, publication, push, production request, runtime
refresh, credentials, configuration, access, schedule or migration is included.
The local source mirror has no configured Git remote, so remote/live freshness
must be rechecked by the release coordinator before any publication.

## Completed candidate checks

All 78 test suites passed sequentially (76 period suites, standings snapshot
suite and the new integration suite). TypeScript `--noEmit --incremental false`
and `npm run build` passed. Focused lint on new helpers/tests passed with zero
errors/warnings. Changed-file lint reports 136 errors/1 warning, exactly matching
the same files from v115 (existing rules, primarily explicit any). The previously
reported whole-repository baseline is 1,091 errors/47 warnings; no whole-directory
scan was repeated. Build retains its existing chunk/classification warnings.

The new 14-check source/period suite exercises actual loaders in a shared fake
R2 environment, not only parsers: incomplete standings preserve bytes/source
time while period proof succeeds; neither feature writes the other's cache;
standings 429 and analysis 403 use separate allowed-host cooldowns; one host
can recover without unblocking the other; old v11 bytes remain unchanged. The
suite also runs in the explicitly disabled rollback mode. Dedicated period,
SQLite, archive, historical-read and source suites retain their full coverage.
No real provider or production data is used. Existing immutable observation,
forecast/hash and archive checks are included in the full run.

SQL schema/migrations, environment examples, dependency manifests, lockfile,
My Matches, Today, Results page and all CSS are byte-identical to v115.
All unchanged tracked base files have an external SHA-256 verification manifest.
Only SourceStamp labels/profile semantics change in the UI; the original source
guard's desktop/320/390px component QA remains applicable because its TSX and
all CSS are byte-identical to that reviewed input. Combined full-app browser QA
and hosted CI have not been performed; do not describe those as passed.

## Rollback contract

Build rollback directly from this combined candidate, using the compatible
rollback patch `f5eaea2b8207031b241a19c024a0e7bf9454f9a7` only for the
analysis-route disablement and its dedicated test. Preserve the complete source
guard, v12 cache, proof-aware writer, digest2 helper and archive verifier.
Do not deploy plain v115, reset caches, rewrite history, or target a settled count.
The rollback manifest explicitly excludes the feature-enabled causal suite and
adds its disabled-feature replacement. Run each listed suite sequentially.

Next owner: independent release reviewer. No publication readiness beyond local
source/test/build verification is claimed. Verify exact candidate and rollback
commits, live head and deployment authorization before release.
