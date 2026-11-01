# Sites v72 source review (not a deployment)

This draft review applies selected source changes from Sites v72 commit
`a749d25788722c9cd97db8b9ea36c5f267228f1f` onto GitHub main
`9724393366d8aadb700db5a009e44ba69cda56d4`.

It is intentionally not a wholesale mirror: existing GitHub CI, responsive audit,
export documentation, hosting metadata and generated TypeScript build metadata
are retained. No credentials, environment files, runtime directories or R2 objects
are exported. Added JSON/HTML fixtures are public football-source snapshots, not
user account, favorites or betting records.

## Included
- Selected matches display and match-state freshness.
- Official referee-source authority, parsers and evidence/sample disclosures.
- Source health, persistent rate-limit backoff and update visibility.
- Larger model probability label (an estimate, not a guaranteed outcome).

The official-appointment precedence fix already on main is retained semantically
through the more explicit source-tier logic and associated regression tests.

## Not synchronized yet
The separate `feat/my-matches-panel-v60` branch at
`96e54dca8acb0672892e82ca9011d50d9d78d625` diverges from main. It contains
additional my-matches panel, source-health, data-refresh and selection-tracker
work. That branch is not altered or merged by this PR. Compare and integrate it
separately: blindly replacing either tree would discard functionality.

No merge or production publication is authorized by this review PR.
