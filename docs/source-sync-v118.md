# Production v118 source synchronization

## Verified baseline and scope — 8 November 2026

- Site: https://cardroom-europe.lush-flute-9375.chatgpt.site
- Published version: Sites v118, source `8a17106295c16c6d880f66381a62add0fda84eda`.
- Deployment status was `succeeded`, updated 2026-11-08 13:38:28 UTC.
- GitHub parent: `34d86f11bb77e6e90c81e0fff888130e75704c60`, the current PR #7 / v108 mirror.
- Separate sync branch: `sync/sites-v118-20261108`. Existing branches and PRs remain unchanged.

This imports the published v108-to-v118 source delta, including OAuth error/redirect handling, daily and selected-match freshness, journal evidence, period identity/corroboration, standings preservation, mobile results navigation, retained draw results, Aspmyra location/referee diagnostics and the all-leagues daily list. It does not import unpublished experimental exact-score or Drive uploader branches.

All runtime source, tests and configuration are copied from the immutable v118 commit. GitHub CI and reliability audit are preserved. The handoff combines the production delta with existing GitHub history. The already-tracked `tsconfig.tsbuildinfo` remains byte-for-byte at the GitHub parent, not replaced with generated local state. No credentials, runtime exports, real user data or local cache/state files are added.

## Concurrent work excluded

The separate calendar queue and summary status work is not included. It must complete its own review and release, then receive a separately verified sync. No local branch is an implicit production source.

## Verification

The reconstructed 349-file GitHub parent matched every remote blob and the tree `c4d90364f924e6f3b26ed268f5c1a97d9e407027` before applying the source delta. The local reconstruction commit is not the remote parent identity; the GitHub commit must use `34d86f11bb77e6e90c81e0fff888130e75704c60` as its parent.

- All 81 local regression suites passed sequentially.
- TypeScript passed with incremental output disabled.
- Production build passed, with the existing >500 kB client-chunk warning.
- All 370 non-exempt v118 tracked files match the source blobs exactly. The two exceptions are the combined handoff and preserved generated tsbuildinfo described above.
- Independent read-only source-sync review found no blocker, including file parity, retained handoff sections, concurrent-work exclusion and credential/runtime-state screening.
- `git diff --check` passed. The locked package/CI configuration is unchanged; local checks reused the existing installed dependency tree rather than claiming a fresh locked install.
- Remote CI for the new GitHub head is pending publication and will be reported in the PR. Older green CI is not validation of this source. No new manual desktop/mobile browser QA is claimed for this source-preservation operation.

## Release boundaries

GitHub source preservation and review only. No main merge, force push, Site deployment, migration, provider refresh, runtime data write, permission, secret, OAuth, backup upload or schedule change is included. The Site remains on its independently verified published version. The source commit and GitHub sync commit are separate identities and must not be conflated.
