# Production v119 source synchronization

## Verified baseline and scope — 8 November 2026

- Site: https://cardroom-europe.lush-flute-9375.chatgpt.site
- Published version: Sites v119, source `90b82d32d9baac6c9cb5f220828475514d85c006`.
- Deployment status was `succeeded`, updated 2026-11-08 14:51:57 UTC.
- GitHub parent: `ff403573e7a86fd2b15869f6cc70cef37d9b668c`, the separately preserved v118 source in PR #14.
- Separate incremental branch: `sync/sites-v119-20261108`. Existing branches, PRs and main remain unchanged.

This imports only the 15-file published v118-to-v119 delta: bounded request-local calendar admission, dispatch-cutoff/retry priority, preserved provider cooldowns, visible summary freshness and provenance, and honest referee table empty states, with their tests and documentation. Previously excluded calendar/summary work is included now because this exact source is independently confirmed as published v119. Other experimental and unfinished branches are not imported.

Runtime source, tests and configuration match the immutable v119 source. Existing GitHub CI, audit, prior source-sync reports and generated tsconfig.tsbuildinfo are preserved. The handoff combines the v119 source note with the prior GitHub history. No credentials, runtime exports or working user data are added.

## Verification

The local parent tree `d2596dc0a827614540bb755f18cc606c0a0ac3da` was checked against every remote blob before applying the delta. Local commit identities differ from GitHub: the remote commit must use `ff403573e7a86fd2b15869f6cc70cef37d9b668c` as its parent.

- All 83 regression suites passed sequentially, with optional Cloudflare metadata retrieval disabled; provider fixtures remained offline/local.
- TypeScript passed with incremental output disabled. Production build passed with the existing >500 kB client-chunk warning.
- All 378 non-exempt v119 source blobs match exactly. The two exceptions remain the combined handoff and preserved generated tsbuildinfo.
- Independent read-only source-sync review approved the exact published delta, history preservation and exclusion of secrets/runtime state. `git diff --check` passed.
- Local checks reused the existing installed dependencies, without claiming a fresh locked install or general repository-wide lint cleanup.
- Exact-head remote CI is pending publication and will be reported in the PR. The earlier v118 CI does not validate this increment. No new manual browser or real-device QA is claimed by this source-preservation operation.

## Release boundaries

GitHub source preservation and review only. No main merge, force push, Site deployment, runtime configuration, migration, provider refresh, live data write, OAuth, backup upload, permission or schedule change. Source sync does not prove complete upstream calendar coverage, working off-site backup or uninterrupted operation. The calendar's dispatch cutoff is not a total response deadline, and retry priority is not durable distributed fairness.
