# CARDROOM engineering contract

Read `docs/operations.md` before maintenance and `docs/handoff.md` before taking over work.
These rules apply equally to Codex, Claude and human contributors.

## Non-negotiable invariants
- Preserve Site project `appgprj_6ace68aee5708191be317144ee8b88fa`, its audience and the existing My Matches panel.
- No invented scores, appointments, percentages or zeros for missing data. Keep provenance, season, sample size and last successful date.
- Source failure must preserve previously confirmed values. A new attempt is not a new successful snapshot.
- Respect fixed source allowlists, nextCheckAt and HTTP 403/429; no access-block bypasses.
- Never commit tokens, credentials, runtime exports or local state. Temporary Site access is header-only, same-origin, memory-only.
- Source coverage and permission must be verified before adding a provider. Do not purchase APIs or register accounts without approval.
- Read-only health checks must never fetch providers or mutate storage. Diagnostics expose no raw exceptions or secrets.

## Collaboration and release
- One task, one named owner, one branch. The second agent reviews the diff rather than independently rebuilding the same feature.
- Refresh remote heads before work. Preserve unrelated edits, PR #5/#6 and the open source-sync PR #7. No force-push or unrequested main merge.
- Keep GitHub source sync, Sites deployment and runtime data refresh separate. Record both commit identities when repositories differ.
- Changes need regression tests, TypeScript, existing CI checks and production build. UI changes also need desktop/mobile QA; disclose unavailable checks.
- Obtain independent review when available. Never report that Claude reviewed something unless an actual review exists; self-review is not independent review.
- Publish only through the supported Sites workflow. Verify the deployed endpoint afterward, without forced data refresh.
- Record what shipped, test results, remaining failures and next owner in the handoff. Do not claim continuous uptime from one successful test.
