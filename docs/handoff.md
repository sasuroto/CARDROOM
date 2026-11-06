# CARDROOM handoff — 2026-11-06

## Results journal increment

Owner: Codex. Baseline Sites v105 / source `2df5a7836e9d4aa22c90342c33d3bd988f88ae50`.
Adds D1 append-only pre-match snapshots and normalized observed match outcomes, shared scenario computation and `/results` UI. See `docs/results-journal.md` for eligibility, scoring and backup limitations. No retrospective model performance is fabricated. The new journal is not covered by the existing R2 recovery report.

Local and live release evidence, exact version and GitHub source identity are recorded in PR #7 after verification. Independent Claude/human review is still pending; do not describe self-review as independent review.

## Current maintenance scope

Baseline: Sites v103, source `76a4dd2376f77be3a1ce0504afa4e1208a23a6da`.
GitHub review branch: `sync/sites-v103-20261106`, PR #7; do not merge without approval.

This increment adds shared agent instructions, a PR checklist, an operational runbook, a read-only `/api/health` endpoint and rate-limited redacted cache failure logging. No provider changes, data migration, access changes or new subscriptions.

## Local verification

- Existing test suites completed successfully; the added operational-health suite passes 30 checks.
- TypeScript check passed with incremental output disabled.
- No UI changes; no new browser visual QA is claimed.
- Production build, exact published version and post-deploy probe are recorded in the release handoff/PR after completion. This source document does not claim a deployment before it occurs.

## Confirmed baseline failures

- Eight league statistics feeds share ValueStats, with recorded HTTP 403/backoff.
- UEL and UECL had no successful statistics snapshot and 18 missing appointments combined in the 6–12 November checked window.
- Bundesliga statistics rejected an unconfirmed season; last successful snapshot 1 November.
- Primeira statistics use a manual 16 October snapshot.
- A stored report with persisted=true is not proof that its upstream data is fresh.

The existing hourly task was re-enabled on 6 November. Its next successful unattended execution must be confirmed from recorded run history, not inferred from this document or a manual pass.

## Daily recovery increment

This increment adds daily summary/referee checkpoints, seven bounded slots, SHA-256 verification and an isolated-copy recovery drill. Baseline is Sites v104 (`e739c92e65892c15ee4468189c5a80044337a6de`). No live restore or raw-data export endpoint is added. See `docs/recovery.md` for exact limits. Release evidence is recorded in PR #7 after verification.

Runtime backup suite: 35 checks passed; TypeScript passed. The v104 GitHub workflow completed successfully, including its responsive audit. This does not substitute for the current commit's CI. Next task: confirm an unattended scheduled run and assess an independent watchdog before expanding source coverage.

Independent review and approved source coverage evaluation remain pending. No Claude review has yet been performed. Do not represent any old audit's paused-network state as current without rechecking.
