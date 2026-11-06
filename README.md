# CARDROOM

European football intelligence — matches, teams, players, referees and evidence-based match scenarios in one workspace.

[Live site](https://cardroom-europe.lush-flute-9375.chatgpt.site) · [GitHub](https://github.com/sasuroto/CARDROOM)

## What CARDROOM does

- Match calendar with live, upcoming and completed games.
- Favourites and a compact “My matches” panel, saved on the current device.
- Tournament tables, team and player information.
- Referee appointments, appointment provenance and available referee statistics.
- Match details, venue and weather where verified data is available.
- DOT Predict: calculated scenarios with supporting evidence and sample sizes.

The interface is primarily Russian. Display dates and match times use **Asia/Tbilisi (UTC+4)**.

## Competitions

| ID | Competition |
| --- | --- |
| `epl` | Premier League |
| `ucl` | UEFA Champions League |
| `uel` | UEFA Europa League |
| `uecl` | UEFA Conference League |
| `laliga` | La Liga |
| `segunda` | Segunda División |
| `seriea` | Serie A |
| `bundesliga` | Bundesliga |
| `ligue1` | Ligue 1 |
| `superlig` | Süper Lig |
| `primeira` | Primeira Liga |

Support for a competition does **not** imply complete coverage of every data field.

## Stack

React 19, TypeScript, Vinext/Vite, Tailwind CSS and Cloudflare Workers. The current Sites deployment uses an R2 `BUCKET` binding for persistent snapshots. Optional D1/Drizzle starter modules are present; D1 is not enabled in the current hosting manifest.

This is a Worker-backed application, not a static export. Deploying it to another platform requires adapting its storage, runtime and authentication integrations.

## Local development

Requirements: Node.js `>=22.13.0` and the package-manager version declared in `package.json` (`pnpm@11.25.0`).

```sh
git clone https://github.com/sasuroto/CARDROOM.git
cd CARDROOM
# Check out the desired release/sync branch before installing.
pnpm install --frozen-lockfile
pnpm dev
```

Use the local URL printed by the development server. Local preview data and storage are separate from production.

```sh
pnpm build
pnpm start
```

`start` previews the built Worker locally; it does not publish the website. See [runtime documentation](docs/runtime-starter.md) for the retained starter's environment, authentication and storage details.

## Repository structure

| Path | Purpose |
| --- | --- |
| `app/` | UI and server API routes |
| `lib/` | Source adapters, validation, caching, models and seed snapshots |
| `tests/` | Regression checks and source fixtures |
| `public/` | Static assets and flags |
| `build/`, `scripts/` | Worker integration, build and development helpers |
| `.openai/hosting.json` | Sites project identity and storage bindings |

## Data sources and trust

Adapters use fixed sources for their supported fields: ESPN for calendars and match information; official competition/federation sources for supported referee appointments; Soccerbase, ValueStats, Balonario and saved Footiqo snapshots for supported referee statistics; and league-summary sources configured in the handlers.

Coverage differs by league and field. Not every competition has a complete official crew adapter, and a referee name does not prove that assistants or VAR appointments are available.

Rules enforced by the data pipeline:

1. Prefer verified official appointments over secondary match feeds.
2. Retain confirmed values and their dates when a source fails.
3. Represent missing data explicitly, not as zero.
4. Validate season and coverage before accepting a snapshot.
5. Respect `nextCheckAt`, HTTP 403/429 and provider backoff.
6. Keep partial updates visibly distinct from complete coverage.

Scenario percentages are model estimates, not verified prediction accuracy or guarantees. Historical frequencies such as “2 out of 3” describe only the displayed sample. CARDROOM does not guarantee betting outcomes.

## Refresh API

These GET handlers may refresh and persist data; they are not all passive reads.

| Endpoint | Purpose |
| --- | --- |
| `/api/health` | Read-only operational checks; no provider requests or storage writes |
| `/api/referees` | Connected leagues, refresh status and next eligible checks |
| `/api/referees?league=<id>` | Refresh one eligible league |
| `/api/referees?league=<id>&read=1` | Read the saved referee refresh result |
| `/api/data` | Read/refresh summaries within their six-hour schedule |
| `/api/matches?date=YYYY-MM-DD&league=all` | Calendar/results for a Tbilisi calendar date |

For referee maintenance, read the league list, then process only due leagues **sequentially**, with a 60-second request timeout. Read each result back using `read=1`; the `runId` must match and `persisted` must be `true`. A timeout alone does not prove that the server failed to save: inspect saved state before retrying.

After the pass, read `/api/data` twice and compare `lastAttempt`, `refreshStatus`, `updatedFields`, `refreshErrors` and block dates. Preserve the six-hour interval. Refresh today's and yesterday's calendars using Asia/Tbilisi dates.

## Code is not live data

GitHub stores source code, tests and committed seed/reference snapshots. Production refresh results live in the site's persistent storage. Device-local favourites are not stored in GitHub. A GitHub push does not refresh production data or automatically publish a Sites version.

## Checks

Shared Codex/Claude process: [AGENTS.md](AGENTS.md), [operations](docs/operations.md), [handoff](docs/handoff.md). Health HTTP 200 can still mean degraded data; inspect the JSON status and alerts.

```sh
node tests/european-expansion.cjs
node tests/data-reliability.cjs
node tests/referee-hourly.cjs
pnpm run test:qa
pnpm exec tsc --noEmit
pnpm build
```

Each `tests/*.cjs` file is an independent check. Some checks require the installed dependencies or a configured preview; inspect the script before running browser/network diagnostics.

## Release snapshot and limitations

This sync is based on **Sites v102**, source commit `eb8eb51fbdaf2e0e3127ce18a807f9b457225f79`, with this README added separately for GitHub. It includes the 11-competition expansion and the summary-cache merge fix.

At handoff, coverage remained partial: some providers were blocked or had unconfirmed seasons, and the newly connected Europa/Conference leagues did not yet have fully confirmed tables, summaries or referee statistics. Check the live metadata rather than treating this README as a current data-status report.

The v102 baseline had two TypeScript errors in `lib/fixture-display.ts`. This maintenance update adds explicit date-type guards and regression cases. Run the checks above when changing the code. Browser verification remains limited by preview infrastructure availability.

## Security and deployment

- Never commit access tokens, API keys, `.env` secrets, browser sessions or local runtime state.
- Use supported temporary Sites access only for its intended site; never put credentials in URLs or logs.
- Preserve the site's audience and project identity unless explicitly changing them.
- Keep source sync, code publication and runtime data refresh as separate operations.
- Use a review branch and pull request; do not overwrite collaborators' branches or force-push `main`.

No reuse licence is granted by this README. Third-party assets and dependencies retain their respective licences.
