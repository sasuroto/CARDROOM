# Bounded calendar queue repair (local candidate, 8 November 2026)

Owner: Codex. Branch `fix/calendar-queue-fairness-20261108`, based on published
Sites v118 source `8a17106295c16c6d880f66381a62add0fda84eda`. The release coordinator
refreshed the official source and verified that exact head before implementation.
No publication, provider/production request, data migration, credential, schema,
settings, dependency or schedule change is part of this patch.

## Reproduced defect and correction

The unchanged v118 route eagerly submitted 32 daily queries. With a deterministic
2.2-second response time, the last four host tickets expired at 15 seconds. Only
28 requests ran, leaving the final two leagues incomplete at 15.4 seconds. This
is a real queue deadline, distinct from the previously corrected test clock.

The route now runs four request-local query jobs at a time, keeping each league's
UTC date/month queries together. All 32 queries finish at 17.6 seconds in that
fixture, with maximum provider concurrency still four. There are no automatic
retries, shared Promises, new providers, date-range assumptions or raw caches.

Only work not yet submitted is stopped by a 30-second dispatch cutoff. Every
already-submitted job is awaited. Its original ESPN 15-second queue budget,
30-second active lease, 12-second fetch timeout, maximum 64 pending tickets and
403/429 cooldown remain byte-for-byte unchanged. The 30 seconds is **not** a
response deadline: storage, queued work, provider responses, journal capture and
referee enrichment can extend elapsed time. There is no new total request-time
or storage-time guarantee. The fixture tests include a job submitted at 28 seconds,
starting its fetch after a slow R2 read at 35 seconds, and finishing at 42 seconds.

Request scope remains bounded by the existing window: 32 jobs for all 16 leagues
on a day, or at most 48 jobs for a three-month upcoming window. A single-league
selection still submits only that league's two or at most three queries. No job
is resubmitted within an invocation. Independent isolates still have independent
concurrency pools; R2 cooldown is not a distributed rate limiter.

## Retry fairness and honest cache results

The next eligible attempt prioritizes the preceding cached errors in their saved
order, then the other configured leagues. Scheduler-owned `dispatched` metadata
puts never-dispatched leagues before attempted failures in the public errors
array. This matters when every attempted response is malformed: simply preserving
failed membership, or using query-major order, could repeatedly omit the tail.
The internal metadata is not provider-controlled and is not added to the cache
schema or response. Failures remain failures; a dispatched request is not proof
of complete coverage or successful source data.

With 10-second responses, three daily retry passes give all 16 leagues a turn,
including when every response is malformed or one query is fast/malformed and the
other slow/successful. Four bounded passes cover all 16 in the three-month
malformed fixture. These are offline fixture results, not a universal fairness
promise: ordering depends on the previous aggregate cache being readable and
retained. Missing/failed R2 reads or writes and concurrent cache overwrites can
lose that priority. No durable coordination, request coalescing or global fairness
is claimed.

For partial results with a finite explicit retry hint, cache expiry is the later
of that retry time and one minute after the original attempt (or the normal TTL
if shorter). A local 60-second queue deferral is no longer hidden behind a 5/30-
minute aggregate TTL. A longer provider cooldown intentionally keeps the failed,
dated response until that deadline rather than repeatedly attempting blocked work.
Partial results without an explicit usable hint retain their ordinary TTL. Invalid
or future attempt timestamps and nonfinite stored retry values are cache misses.
Healthy cache TTLs, client polling/backoff and original timestamps do not change.
An expired aggregate entry still goes through the original persisted host guard.

The route preserves the configured leagues, UTC/Tbilisi day filtering, month/year
rollover, nearest upcoming date, genuine empty results, source/score/period/team
identity, stale dated fallback, referee enrichment and existing journal capture.
Old cache entries are neither migrated nor deleted. UI stale-summary behavior is
a separate task.

## Validation

All checks use synthetic offline fixtures. `CLOUDFLARE_CF_FETCH_ENABLED=false`
disables optional Miniflare metadata retrieval. Workerd provider requests reach
only the test's loopback HTTP fixture.

- The new actual-route regression fails on exact v118: 28 calls, two errors,
  15.4 seconds. It passes 64 checks on the candidate, including 32/48 query sizes,
  repeated slow/error fairness, cache boundaries, 403/429, invalid cache values,
  source provenance, stale fallback, concurrent callers, slow storage and timeout.
- The unchanged raw host overflow/expiry assertions still reject the 65th ticket
  and expire 60 queued tickets exactly at 15 seconds. The provider/calendar suite
  passes 26 checks; its former 2.2-second dropout expectation now requires 32/0.
- Actual workerd passes 25 ownership/cancellation/backoff checks, including three
  simultaneous calendar invocations with 96 individually owned responses. Aborting
  one calendar client does not strand two survivors. Concurrent 429 calendars send
  no more than four upstream attempts; later requests retain the cooldown.
- Three overlapping deterministic 2.2-second calendars complete 64/96 source
  requests at 35.2 seconds, with 4/6/6 incomplete leagues and maximum concurrency
  four. This is explicitly partial, not a claim that every concurrent load succeeds.
- TypeScript, production build, changed helper/new-test lint and diff checks pass.
  The build retains the existing large-chunk warning.
- Full tracked-source/test ESLint matches v118 exactly after normalizing checkout
  paths: 1,091 errors and 47 substantive warnings, plus four ignored-file notices.
  General repository lint is not clean.
- Final sequential regression run: all 82 suites passed on the unchanged final
  runtime and test source. Independent review found both starvation edges
  described above, verified the corrections and approved the runtime diff.
  Exact-commit closeout remains with the release coordinator.

Local evidence is in ignored `outputs/calendar-queue/`. Reproduce with:

```sh
CLOUDFLARE_CF_FETCH_ENABLED=false node tests/calendar-queue-fairness.cjs
CLOUDFLARE_CF_FETCH_ENABLED=false node tests/calendar-rate-limit.cjs
CLOUDFLARE_CF_FETCH_ENABLED=false node tests/worker-request-isolation.cjs
for t in tests/*.cjs; do CLOUDFLARE_CF_FETCH_ENABLED=false node "$t" || exit 1; done
npx tsc --noEmit --incremental false -p .
CLOUDFLARE_CF_FETCH_ENABLED=false npm run build
```

Next owner: release coordinator, to integrate the independently reviewed changes
and verify the exact combined candidate before any separately authorized release.
No UI/browser QA, external CI run, production success or uptime promise is claimed.
