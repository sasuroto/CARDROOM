# Google Drive connection — locked-page release

Owner: Codex. Branch `feat/backup-drive-oauth`, based on local archive preparation
`178fd8d` and live v107 source `d2f1dad`. Refreshed Sites source `main` matched that
base on 6 November 2026. Owner approved adding and publishing a closed connection
page on 6 November. Publication result belongs in the release handoff; do not
infer deployment from this source. No runtime configuration, real token exchange,
schedule change or file upload has been performed.

This connects an independently authorized, user-owned Google OAuth client; it
does not replace Sites sign-in or borrow a visitor connector's credentials.

## Routes and authority

- `GET /backup-drive`: server-rendered, no-script, no-store connection page.
  Anonymous users get a top-level ChatGPT sign-in link. With no configured owner,
  a signed-in user sees ONLY their own trusted Site ID for manual setup; this
  does not enroll them or grant access. With an owner configured, other users
  get 403 before storage access. The owner sees stored status and a native POST
  form only when configuration is ready and no cooldown applies. There are no
  credential-entry fields or browser secret storage.
- `POST /api/backup-drive/start`: explicit same-origin owner action only. GET
  cannot initiate consent. HTML form errors return to a fixed clean page URL.
- `GET /api/backup-drive/callback`: fixed Google authorization callback, accepted
  only with the same trusted Sites user ID, matching browser cookie and an
  unexpired one-use state created by the owner's POST. Every browser outcome
  redirects to the fixed page URL, without code/state/provider details. A generic
  failure flag distinguishes a failed attempt from a previously stored grant.
- `GET /api/backup-drive/status`: owner-only stored-state inspection. No provider
  requests, token refresh or storage writes; no secrets or account email returned.

The planned exact Web application redirect URI is:

`https://cardroom-europe.lush-flute-9375.chatgpt.site/api/backup-drive/callback`

It is a code contract, **not an enabled OAuth flow**. Do not use Sites' reserved
`/callback`. Do not register invented JavaScript origins: this increment has no
browser Google API client. Picker setup is a later, explicit addition.

Authorization depends on Sites sanitizing/injecting `oai-authenticated-user-id`.
The Site-specific owner ID must be established from a genuine signed-in owner's
request through the supported platform. Do not infer it from a Google ID, email,
workspace ID, bypass token or untrusted browser header. Temporary service access
is deliberately insufficient. A standalone deployment must supply an equivalent
trusted boundary; do not expose the dev server as an authenticated production API.

## Runtime configuration (values never committed)

Names are listed in `.env.example`. The feature defaults disabled. Required
configuration is: enabled flag explicitly `true`; trusted Site owner ID; Google
Web client ID and secret; expected Google account email; a separate random
32-byte AES key encoded as 43-character unpadded base64url; and explicit OAuth
mode `testing` or `production`. Use supported Sites secret entry, not chat,
screenshots, Git, source constants, client bundles or `.openai/hosting.json`.
No real values or encryption keys have been generated/provisioned by this work.

The AES key encrypts credentials, not archives. It is **not** the independent
archive recovery key. Changing it (or owner/client/account binding) without a
migration makes the old connection unreadable; stop and reconnect deliberately,
never silently treat unreadable ciphertext as missing or healthy.

## Security and persistence

State, browser nonce and PKCE verifier use independent 256-bit randomness. The
cookie is `__Host-`, Secure, HttpOnly, SameSite=Lax, ten-minute lifetime. D1 stores
only state/browser hashes and an AES-256-GCM encrypted PKCE verifier. Atomic
`UPDATE … RETURNING` consumes state before the code exchange. A new start
invalidates the older flow; conditional token insertion prevents an older slow
callback overwriting a newer flow. Starts are throttled to one per minute.
Callbacks never clear this shared cookie: a late response must not erase a newer
flow's cookie. Replay is blocked in D1; the cookie expires at its short TTL.

Only fixed HTTPS Google authorization/token/Drive-about destinations are used.
Server requests have 20-second timeouts and a 32 KiB streamed response cap;
redirects are rejected. Secrets are sent in POST body/Authorization header only,
never URLs. There are no raw exception/provider-body logs or automatic retries.
Provider failures store and read back cooldown, including Retry-After. A failed
cooldown write/readback is explicitly unconfirmed, not a retry invitation.

The code requests only `drive.file`, offline access and explicit consent; rejects
extra/missing scopes and absent refresh token. It checks the returned Drive
account against the configured owner email via `about.get`. The refresh token,
account identity and expiry are encrypted with random AES-GCM IV and AAD binding
to Site, client, owner, email and purpose. Access token is not persisted. Saving
requires an exact revision readback and authenticated decryption. Failed or
superseded reconnects leave the old stored credential unchanged.

New schema-only migration `0001_strong_black_knight.sql` adds two bounded singleton
tables, separate from `journal_*`; no old migration/table is changed. OAuth tables
and secrets are intentionally excluded from portable archive v2. Journal and
legacy v105 recovery coverage and semantics are unchanged.

## Honest status

`credential-stored` proves only readable credential storage, not present Google
access, folder authorization, upload, restore, scheduling or off-site protection.
The response keeps `providerAccessVerifiedNow`, `folderAccessVerified`,
`backupEnabled` and `offsiteVerified` false. `reauthorization-required` is returned
after known expiry; no zero/missing accuracy or fabricated backup success.

In External/Testing, the connection's deadline is at most seven days, or sooner
if Google returns `refresh_token_expires_in`. Changing configuration to production
does not extend a token issued in Testing. Production tokens can still expire or
be revoked; null deadline is unknown, not permanent access. Status checks do not
contact Google, so revocation is not detected by this increment.

## Gates before connecting or enabling unattended backup

1. Independently review code; approve publication separately. The owner-only
   Connect form is implemented. Still test desktop/mobile, real Sites identity, secure
   cookie roundtrip and callback dispatch after Google redirect. Ensure proxy and
   application diagnostics do not log callback queries or provider credentials.
2. Confirm Google accepts the intended redirect/domain configuration. The user
   does not own `chatgpt.site`; do not claim it can be domain-verified as theirs.
   Resolve a provider domain-verification requirement before proceeding.
3. Complete the Web client and securely provision configuration. Deploy the
   migration/routes with unchanged Site access; do not enable by default or ask
   for credentials in chat. Live end-to-end provider consent remains untested.
4. Grant the **new OAuth app** access to the existing private backup folder via
   Google Picker (or another documented explicit per-file grant). A folder made
   by ChatGPT's other connector is not automatically covered by `drive.file`.
   Do not broaden scope to full Drive or create a duplicate folder silently.
5. Build the bounded uploader, account/folder rechecks, refresh/revocation and
   disconnect handling, independent archive encryption/key custody, idempotence,
   retention and durable failure telemetry. Respect cooldown across all calls.
6. Retrieve an uploaded real archive independently and restore in isolation.
   Only after verification integrate with the existing job. No duplicate schedule.
7. Resolve External/Testing's seven-day token lifetime before claiming durable
   unattended operation; record production consent and a real scheduled pass.

## Primary references

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2
- https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get
- https://developers.google.com/workspace/drive/picker/guides/web-picker
