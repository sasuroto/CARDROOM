# Portable archive v2 — preparation, NOT deployed

This branch is based on published Sites v107. No HTTP route, production export,
new schedule, external storage account, migration or production restore is added.
The legacy v105 twelve-record backup and its health contract remain unchanged.

## Scope

`captureArchive` reads only fixed R2 keys (summary + all 16 configured referee
reports) and both published D1 journal tables. It retains every observation
revision, original JSON payload string, committed_at, observed_at, checked_at,
model version, null, source date and error. It does not export credentials,
browser favourites, calendar/weather caches or infrastructure settings.

The format is pinned to schema/version 107. Unknown journal tables or changed
columns fail closed. The unpublished exact-score extension must be added to a
new reviewed format before deploying that extension: it must never be silently
omitted. The v107 migration in Git supplies the SQLite table/index definitions.

Capture uses fixed reads only, never source handlers or SQL writes. A D1 batch
collects rows; the overall R2 + D1 archive is NOT an atomic snapshot. Capture
start/end are recorded. Limits are 10,000 rows per table and 16 MiB; exceeding
either fails, never silently truncates. Larger archives require a separately
tested paginated format with a consistent cutoff, not increasing limits blindly.

SHA-256 covers the entire manifest, original records and rows. Observation
digests/identities are checked independently. Integrity is not authenticity:
a hash cannot protect against someone who can replace both data and hash.

## Local isolated restore

`node scripts/archive-drill.cjs` accepts archive JSON on stdin, no database path.
It verifies the bundle, creates SQLite **only in memory**, applies the fixed
v107 schema, inserts the original journal rows using bound parameters, checks
SQLite integrity, reads rows back and compares the full archive digest. R2 JSON
records are round-tripped in memory. It prints counts/status only, no payloads.
This is NOT a Cloudflare restore, write-permission check or off-site restore.
Use approved private transfer channels for real archives; do not commit, paste
into chat or save them in shared folders. Tests use synthetic football records.
Retain this verifier, the exact source commit, dependencies and fixed schema with
the recovery tooling: JSON alone is not a self-contained executable restore kit.

## Next release gates

1. Choose an external destination, owner, approved cost ceiling and encryption
   key custody. Use a separate failure domain/account with least-privilege writes,
   version retention/immutability; no public export endpoint or arbitrary URL.
2. Approve acceptable data loss (daily copies can lose up to a day of journal
   writes) and retention. Proposed initial policy: 7 daily + 4 weekly versions.
3. Implement authenticated server-side delivery, bounded execution, idempotent
   capture IDs, retries/backoff and explicit missing/failed/verified telemetry.
   Integrate with the existing maintenance path; do not create duplicate jobs.
4. Validate a real capture without exposing payloads. Independently retrieve the
   external copy and rehearse restoration in an isolated Cloudflare environment.
5. Only then enable production capture following explicit publication approval.
   A live rollback/restore remains a separate approved operation.

No off-site protection, recovery-time objective or production backup coverage
increase is claimed by this preparatory code.
