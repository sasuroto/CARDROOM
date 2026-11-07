# Drive upload and restore preparation, 7 November 2026

## Local HTTP route increment (not published)

The local branch `feat/drive-upload-route-local-20261107` adds
`POST /api/backup-drive/upload`, based on draft PR #11 commit
`7add27bb08d5e31f50ef687fc4f712a2a4f2207d`. It accepts only the trusted configured
Sites owner, exact same-origin request target/Origin, JSON content type and the
single action `{"action":"create-one-backup"}`. The body is limited to 128 bytes
and two seconds. GET, HEAD, OPTIONS and other methods return 405 without storage
or provider activity. Unauthorized requests never read storage.

Responses use private/no-store, no-referrer, CSP, no framing and no CORS grants.
Only allowlisted statuses/reasons and checked transfer metadata are returned;
provider payloads and unexpected fields are never forwarded. Explicit upload,
non-atomic acceptance and existing connection/key/folder gates still apply.
The route remains disabled with default configuration. No UI button, schedule,
secret entry, enrollment or credential generation is added. This route depends
on Sites injecting the trusted user identity; do not expose a standalone server
that accepts arbitrary identity headers. Real Sites request/identity/Origin
behavior remains a publication-time QA gate.

No part of this increment has been published to GitHub or Sites, and no live
configuration, persistent access or data has changed. Before a real manual test:
safely provision the approved client/owner/key configuration, obtain explicit
per-file folder consent, approve the migration/route publication, and perform
an independently retrieved isolated restore. Automatic operation and retention
remain separate decisions.

## PR #11 foundation (historical scope)

Local-only branch `feat/drive-backup-local-20261107`, based on PR #10 commit
`22158260b86efa3b35ddde08afbf208f5f9ff620`. No publication, migration, provider
request, credential generation, OAuth grant, archive upload or schedule change
has been performed. There is deliberately no HTTP upload route or maintenance
caller. The locked connection page and legacy v105 recovery are unchanged.

## Prepared implementation

`runDriveBackup` is a server-only function for a future reviewed owner action.
It requires a trusted Sites owner POST, same-origin checks, the existing readable
OAuth connection, an explicit upload-enable flag, explicit non-atomic-copy
acceptance, the exact configured backup folder ID, and a separate archive key.
No IDs or key values are committed. The approved existing CARDROOM Backups folder
must first be granted to this OAuth client through Picker or another documented
per-file grant; another connector's access does not grant this app access.

The OAuth refresh requests no new scope and accepts only `drive.file`. Each run
checks Google's account email AND permission identity, and requires the exact
folder to be owned by the account, untrashed, private and writable. Broader scopes,
shared folders, account changes and token rotation fail closed. Access tokens
remain in memory. Fixed Google HTTPS endpoints reject redirects; request bodies
and provider errors are never logged. Shared OAuth/upload cooldown honors 403,
429 and Retry-After. A local status check does not contact Google.

Two full fixed-scope captures must agree exactly on schema, original R2 strings
and D1 rows. There are no retry loops; missing data, changes, unsupported schema,
>30-second capture, >10,000 rows/table or >2 MiB serialized archive stop before
upload. The existing v2/v3 validator retains all 17 R2 records and all journal
tables defined by the detected migration, including empty exact11 tables in v3.
OAuth credentials and upload state are never captured. Additional credential-key
and known-secret guards reject suspect payloads rather than redact originals.

**The result is still not an atomic cross-store snapshot.** Two identical passes
only observe stability; they do not prevent changes and reversions between reads
or establish a point-in-time recovery boundary. The manifest retains
`captureAtomic:false`. No incomplete, oversized or changing archive is uploaded.
A production restore or a stronger consistency promise remains gated on an
approved write-quiescence/transactional export design.

AES-256-GCM encrypts the original archive with a random IV; authenticated context
binds the file to its folder and attempt. The required archive key must differ
from the OAuth-token encryption key. Only ciphertext goes to Drive. The owner
must securely retain a separately approved recovery-key copy outside Sites;
Google/OAuth credentials and the key are not inside the archive. Losing that key
makes the backup unrecoverable. Do not generate, configure, rotate, paste or
transmit real keys as part of this local preparation.

A schema-only migration adds one `backup_drive_upload` row, separate from all
journal and OAuth rows. Before create, it durably stores a Google-preallocated
file ID, attempt ID, hashes and byte size. An atomic lease and readback prevent
concurrent creates. Successful repeats in the same UTC day make no new request.
Timeout/uncertain write outcomes can only retrieve the original file ID, never
recapture/re-upload under a new ID. A missing file after an uncertain outcome
remains blocked for explicit operator review. No automatic deletion or retention
policy is implemented. The state holds no archive payload or credentials.

After create, the code separately retrieves metadata and ciphertext, verifies
parent/privacy/identity/size, exact ciphertext SHA-256, AES authentication, full
archive integrity and original plaintext digest. A transfer can report
`uploaded-verified`, but `restoreDrillVerified`, `offsiteVerified` and
`backupEnabled` remain false. A stored successful transfer is not a current
provider-health guarantee. An expired or revoked grant cannot silently pass.

Capture enforces a 30-second deadline around each awaited R2/D1 read. Those
bindings do not support cancellation: a timed-out platform read may finish, but
no further reads or upload are started. SQL byte accounting only sums the first
10,001 ordered rows of each table, matching the retrieval prefix. Oversized
row sets fail closed instead of scanning all historical rows.

The transport allows at most 20 seconds per request and a 120-second provider
operation budget, 32 KiB metadata responses, 3 MiB encrypted downloads. There is
one multipart create only, with a payload below Google's 5 MB recommendation.
Readback and cooldown persistence failures are explicit unconfirmed states.

## Local recovery evidence and scope

Tests use synthetic OAuth records and football payloads, a fake Drive service,
and real in-memory SQLite. They exercise the upload/readback/decrypt sequence,
then feed the downloaded archive into the existing `scripts/archive-drill.cjs`.
It restores only in memory, with fixed journal migrations and original strings,
and rechecks the archive digest. This is not an independent real Drive retrieval,
a Cloudflare restore, runtime credential test or live production recovery.

The existing drill is retained for v2/v3. To recover an approved encrypted file,
use the matching `decryptArchive` implementation with its documented independent
key and authenticated folder/attempt identifiers, then the existing in-memory
SQLite drill. `scripts/drive-archive-drill.cjs` is the offline CLI: expected `--folder` and
`--attempt` arguments, encrypted JSON on stdin, independent key through file
descriptor 3. It emits counts only, never plaintext payloads. An isolated
Cloudflare restore remains a release gate. Never put keys on a command line,
in chat or Git.

## Approval and enablement still required

1. Independently review this exact diff and finish local checks; publish only
   after explicit approval and preserve Site project/audience.
2. Safely provision verified owner/client/account settings and both independent
   keys. Creating credentials, persistent access and key configuration need the
   applicable action-time approval; this code does none of those operations.
3. Confirm the Google consent domain, callback-query log safety, actual trusted
   Sites identity/cookie roundtrip, and explicit grant of the existing folder.
   Do not broaden to full Drive to work around a missing `drive.file` grant.
4. Resolve Testing's seven-day lifetime. Review a real owner-only upload route,
   disconnect/revocation behavior and telemetry before enabling it. Reconnection
   with unexpected token rotation is deliberately not silently supported here.
5. Confirm non-atomic recovery/data-loss expectations and key custody. Authorize
   one real test archive; independently download and restore it in an isolated
   Cloudflare target with the owner. Production restore is separately authorized.
6. Only after successful recovery approve integration into the existing hourly
   maintenance task, daily cadence, retention (e.g. 7 daily + 4 weekly), and
   cleanup rules. No duplicate task or unattended backup is created now.

Primary API references: Google Drive files.generateIds, files.create multipart
uploads, files.get, and drive.file per-file authorization. No application code
falls back to full Drive scope, arbitrary URLs, public links or another account.
