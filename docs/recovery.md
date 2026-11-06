# Runtime recovery — bounded daily checkpoints

## What is protected

Only `cardroom/data-v1.json` and the 11 fixed `referee-updates/v1/<league>.json` reports. Original values, source dates, run IDs, partial coverage and failures are preserved verbatim. These are separate sequential reads, not a database-wide atomic snapshot.

`GET /api/data` attempts a checkpoint before its normal refresh logic, including on a cache hit. It does not force providers or change refresh intervals. One complete checkpoint per Asia/Tbilisi day is stored under `recovery/v1/daily/slot-0.json` through `slot-6.json`. A slot is reused seven days later, using an ETag condition so a concurrent writer cannot silently replace the winning snapshot. There is no deletion sweep. If maintenance misses days, older slots can remain until reused; seven consecutive successful daily copies are not guaranteed.

The first daily capture wins. It may contain old/incomplete upstream data, but must contain structurally valid persisted reports for every league and the versioned summary. Missing or malformed stored records prevent capture; they are never filled from seeds. Payload is capped at 4 MiB. Corrupt/future-dated backup slots are not overwritten automatically. Backup failure is reported separately and does not erase live data or block ordinary source reads.

## Integrity and isolated drill

Each bundle contains a SHA-256 digest of its records. After writing, the saved bundle is read and validated. It is then copied to the fixed `recovery/v1/drill/slot-N.json` key and read back again with the same digest. That isolated copy is the restore drill; it never writes a production data key. Maximum namespace size: seven backup slots and seven drill slots, not an unbounded history.

`GET /api/recovery` checks today's saved bundle and drill without writes/upstream calls. It returns metadata only: no raw records, source payload export or arbitrary key access. `verified` means integrity and isolated-copy recovery succeeded, NOT that data is fresh, all providers succeeded, or a live restore has occurred. HTTP 200 alone is insufficient; inspect `backup.status`. Storage failures return HTTP 503.

This protects against application-level overwrites. Both copies share one bucket and failure domain; this is NOT off-site disaster recovery. The checkpoint excludes individual match/calendar/weather caches and browser-local favourites.

## Production recovery (requires explicit approval)

1. Identify the incident and last trustworthy dated slot; do not merely choose the newest timestamp.
2. Read/check digest, schema, season, league identities, source dates and run IDs. Compare against current values.
3. Preserve the current affected records separately before changing them. Pause conflicting writers through supported controls only when approved.
4. Prepare an explicit per-key restore plan. Never copy an entire old bundle blindly over newer confirmed data.
5. Use an authorized server-side maintenance operation, not a public restore URL. This release intentionally provides no production restore endpoint.
6. Read back every restored revision/runId, resume the prior schedule and check health. Restoring old values does not make them current.

Do not export production records or secrets into GitHub, chat or shared files. Off-site backup and a full live-restore exercise remain separate future work.
