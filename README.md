# Meal Planner

Family meal planner: phone web viewer plus an MCP server so Claude can plan, save and read our weekly meal plans.

Plans are stored as **structured data** (one Monday–Sunday week at a time,
Europe/Zurich), not images, so Claude can read history back, edit a single
day and build each new plan on what we ate recently. Every write is logged,
and any change can be undone.

> **Status:** the data store, MCP server and phone viewer are built. PNG
> sharing and Lisa's image upload are planned as OpenSpec changes in
> [`openspec/changes/`](openspec/changes/).

## Phone viewer

**[meals.winterbottom.xyz](https://meals.winterbottom.xyz)**: this week's
meals, read-only, phone first. [`WALKTHROUGH.md`](WALKTHROUGH.md) tours it
with phone and desktop screenshots, from planning in Claude to the week view.

- `/` is the current week (Europe/Zurich; Sunday still shows the week that is
  ending). Prev, This week and Next, or swipe left/right, move between weeks.
  `/week/YYYY-MM-DD` opens any week (a non-Monday date redirects to its
  Monday), and `/history` lists every stored week.
- Today's row is highlighted, dinner is the big line, Mon–Wed "Kita" lunches
  read "Thomas at Kita", and the week's prep and notes sit below the days.
- Light and dark mode follow the phone, with a toggle in the header (the
  shared winterbottom design system, vendored in `src/web/static/`).

**Install it:** open the URL on the phone and sign in, then Share → **Add to
Home Screen** (iPhone, Safari) or ⋮ → **Install app** (Android, Chrome). It
opens full screen on the current week.

**Login** is not in this app. The `entra-auth-proxy` sidecar in docker-infra
signs in with Microsoft Entra, admits only the allow-listed email, keeps the
session for a year, and then forwards to the app. The app serves the viewer on
a second port, `VIEWER_PORT` (3001), which is never published: only the
sidecar reaches it. The MCP port serves no viewer pages, and the viewer port
serves no MCP or OAuth routes, so neither surface can leak into the other.
Sign out is at the bottom of each page.

**Analytics:** set `ANALYTICS_SCRIPT_URL` and `ANALYTICS_WEBSITE_ID` to send
page views to the self-hosted Umami (REPO-STANDARDS §11). With either unset,
no analytics script is rendered and nothing is sent.

## MCP server

- **Endpoint:** `https://mcp.winterbottom.xyz/meals/mcp` (StreamableHTTP)
- **Health:** `https://mcp.winterbottom.xyz/meals/health`
- **Auth:** an `x-api-key` header (Claude Code, MCP Inspector), or OAuth for
  claude.ai. When you connect claude.ai, the consent page asks for
  `OAUTH_APPROVAL_PASSWORD`. Without that password nobody can approve a
  connection.

| Tool                                                        | What it does                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_planning_context(weeks_back=6)`                        | Claude calls this first when planning. Returns the titles of the four Flatnotes rule notes for Claude to read, recent weeks in full, weeks already planned ahead, image-only weeks, and the next unplanned Monday. |
| `save_week_plan(week_start, source, days[], prep?, notes?)` | Create or replace one week. `week_start` must be a Monday; every day must fall inside that week. A 2-week plan is 2 calls.                                                                                         |
| `update_day(date, fields)`                                  | Change some fields of one day; everything else stays.                                                                                                                                                              |
| `get_week_plan(week)`                                       | A Monday, or `current` / `next` / `previous`. Returns all seven days.                                                                                                                                              |
| `list_weeks(from?, to?)`                                    | Weeks newest first, with source, status and a one-line dinner summary.                                                                                                                                             |
| `delete_week(week_start)`                                   | Delete a week (undoable).                                                                                                                                                                                          |
| `undo_last_change()`                                        | Reverse the latest save, day edit or delete. Call again to step further back.                                                                                                                                      |

Each day has `morning_snack`, `lunch`, `afternoon_snack`, `dinner` and `note`.
Mon–Wed lunch is usually the literal `Kita`. Claude writes it in from the
household rules; the server never fills anything in.

### Planning rules live in Flatnotes

The rules are four Flatnotes notes: `Meals - Household`, `Meals - Meal Bank`,
`Meals - Recipes` and `Meals - Pantry`. This server never touches Flatnotes and
holds no Flatnotes credentials: `get_planning_context` only names the notes, and
Claude reads them with its own Flatnotes connector. So a planning chat needs
both the Meal Planner and the Flatnotes connectors enabled. To change a rule,
ask Claude to edit the note with the Flatnotes connector.

To create the notes the first time, paste
[`docs/seed-flatnotes-rules.md`](docs/seed-flatnotes-rules.md) into a Claude
chat that has the Flatnotes connector enabled.

### Using it from Claude

[`docs/how-to-use.md`](docs/how-to-use.md) is a short note to paste into a
Claude chat. It covers planning the next two weeks and saving Lisa's plan from
a WhatsApp image.

### Lisa's plans

The **only route today**: share Lisa's WhatsApp image into the Claude app and
say "save Lisa's plan". Claude reads the image, confirms the week, and calls
`save_week_plan` with `source="Lisa"`. The structured data is saved, but the
image is not. An upload page that keeps the original image is planned
(`add-lisa-image-upload`). It is gated on a test of whether claude.ai shows
images returned by MCP tools.

## Run locally

```bash
npm install
MCP_API_KEY=$(openssl rand -hex 32) OAUTH_APPROVAL_PASSWORD=dev \
  MEALS_DB=./meals.db PORT=3000 npm start
curl localhost:3000/health
open http://localhost:3001/        # the viewer (no login locally)
```

On an empty database the server seeds the two example weeks (2026-10-05 and
2026-10-12). To try the tools:

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp \
  --transport http --header "x-api-key: $MCP_API_KEY" --method tools/list
```

Every setting is documented in [`.env.example`](.env.example). On the Pi, the
whole `.env` is stored in Bitwarden as **Meal Planner .env**.

## Image and deployment

The image is built for `linux/arm64` (the Pi) by
[`.github/workflows/build.yml`](.github/workflows/build.yml):

- Every PR that touches the image builds it and runs
  [`scripts/smoke-image.sh`](scripts/smoke-image.sh) on it under QEMU. This
  checks health, auth on `/mcp`, the generic error body, a tool call, the
  non-root user and the `HEALTHCHECK`.
- A push to `main` also publishes
  `ghcr.io/davidwinterbottom-2/meal-planner` as `latest`, the `package.json`
  version, and `sha-<short commit>`.

To run the image locally (any platform Docker can emulate):

```bash
docker build -t meal-planner .
scripts/smoke-image.sh meal-planner
```

The image runs as the unprivileged `node` user (uid 1000) with
`NODE_ENV=production`, publishes no host port of its own, and keeps its
database in `/data`. A host directory mounted there must be owned by uid 1000,
or the app exits with `unable to open database file`.

It is deployed on the Pi by the docker-infra service
[`home-docker/services/meal-planner`](https://github.com/DavidWinterbottom-2/docker-infra/tree/main/home-docker/services/meal-planner)
(compose, `.env`, Apache lines, and the go-live and rollback steps).
Apache on `mcp.winterbottom.xyz` proxies `/meals/` to the container by name
over the `docker-infra` network. To roll back, set `IMAGE_TAG` to an earlier
`sha-…` tag in that service's `.env` and recreate the container.

**After every redeploy, reconnect Claude.** The shared OAuth module keeps
connector registrations and tokens in memory, so a new container forgets them.
In claude.ai: Settings → Connectors → Meal Planner → Disconnect, then Connect,
and enter the approval password. `x-api-key` access (Claude Code, MCP
Inspector) is unaffected.

## Data and backups

All data lives in one SQLite file (`MEALS_DB`, default `/data/meals.db`):
`week`, `day`, and an append-only `history` table holding the before/after
JSON of every change.

> **Known gap — no backups yet.** The database sits on the Pi's volume with no
> automated copy. A lost SD card loses all meal history. Until a backup job
> exists, take a consistent copy by hand on the Pi (`sqlite3` on the host,
> against the service's data directory):
> `sqlite3 data/meals.db ".backup 'meals-$(date +%F).db'"`.

## Shared OAuth code

[`src/vendor/oauth2-authorization-server.js`](src/vendor/) is a verbatim copy
of `mcp-development/shared/`. Change it there first, then re-copy it (see
[`src/vendor/README.md`](src/vendor/README.md)). Its own test suite runs with
`npm run test:vendor`.

## Develop

Open in a VS Code **devcontainer** (Reopen in Container) or Codespaces for a
reproducible environment — see [`.devcontainer/`](.devcontainer/).

```bash
npm install
npm run lint                                   # §10 eslint + prettier --check
npm test                                       # §4 tests, 80% coverage floor
npm run test:vendor                            # vendored OAuth module's node:test suite
npm start & npm run test:e2e                   # Playwright against both listeners
```

`npm run test:e2e` drives a running server (`E2E_VIEWER_URL`, default
`http://127.0.0.1:3001`; `E2E_MCP_URL`, default `http://127.0.0.1:3000`). CI
runs it against the built image and uploads 390px light and dark screenshots
of the week page as the `viewer-screenshots` artifact.

Work is planned with OpenSpec in [`openspec/`](openspec/).

## Standards

This repo follows [REPO-STANDARDS](https://github.com/DavidWinterbottom-2/devcontainer-sandbox/blob/main/standards/REPO-STANDARDS.md).
The shared skills library and this scaffold's workflows are kept current by
[`template-sync`](.github/workflows/template-sync.yml).

It serves a web UI, so it uses the shared **winterbottom design system** (§8) —
vendor `winterbottom.css` / `winterbottom-theme.js` from `docker-infra/design-system`
(see the `design-system-sync` skill).

## Reviews

Code and architecture reviews are recorded in
[`docs/reviews/LOG.md`](docs/reviews/LOG.md) (§9).

## Updates

### 2026-10 — phone viewer

- Read-only week viewer on `meals.winterbottom.xyz`: current week, any week,
  history, swipe, today highlight, Kita, prep, light and dark, installable.
- Served on a second listener (`VIEWER_PORT`) behind the `entra-auth-proxy`
  sidecar; optional Umami analytics; Playwright e2e job in CI.

### 2026-10 — container image

- arm64 image for the Pi, built and smoke-tested in CI, published to GHCR.

### 2026-10 — data store and MCP server

- SQLite week/day store with an append-only history and `undo_last_change`.
- MCP server with 7 tools, x-api-key and OAuth (approval password) auth.
- Planning rules named for Claude to read from Flatnotes (no Flatnotes credentials in this app); the two example weeks are seeded on first start.

### 2026 — created

- Bootstrapped from the `devcontainer-sandbox` copier template.
