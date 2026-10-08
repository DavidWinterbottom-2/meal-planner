# Tasks

## 1. Preconditions

- [ ] 1.1 Confirm the OAuth consent fix is deployed: the vendored module requires `OAUTH_APPROVAL_PASSWORD`. Verify locally that `POST /oauth/authorize` with `approve=1` and no password issues no code

## 2. Image (meal-planner repo)

- [ ] 2.1 Add a multi-stage `Dockerfile` (node:22-bookworm-slim, `npm ci --omit=dev`, non-root, HEALTHCHECK on `/health`) and `.dockerignore`. Verify that `docker build` succeeds and that `docker run` with dummy env answers `/health` 200, or with no Docker daemon, run the same check in CI
- [ ] 2.1a Set `NODE_ENV=production` in the image, so Express never returns stack traces (security review of change 1, finding 2; the app also has its own generic error handler). Verify that `docker run` with the image and `curl -d '{bad' -H 'content-type: application/json' /mcp` returns `{"error":"Bad request"}`
- [ ] 2.2 Add `.github/workflows/build.yml` (QEMU, buildx, `linux/arm64`, push on `main`, tags `latest` plus the version). Verify a green run and that the image appears in GHCR
- [ ] 2.3 Document image build and deploy in the README. Verify that the links to the docker-infra service README resolve

## 3. docker-infra service (docker-infra repo, separate PR)

- [ ] 3.1 Use the `new-service-checklist` skill to add `home-docker/services/meal-planner/` with `docker-compose.yml` (port 8099, `/data` volume, docker-infra network, `TZ=Europe/Zurich`), `.env.example`, `Makefile` (via `mcp-common.mk` if it fits) and `README.md`. Verify `make config` / `docker compose config` parses
- [ ] 3.1a Make the app port reachable **only from Apache** (security review of change 1, finding 1). The app trusts exactly one proxy hop for `req.ip`, so a direct caller could forge `X-Forwarded-For` and dodge the OAuth approval rate limit. Either publish 8099 only on the Docker bridge (`172.17.0.1:8099:3000`, which `host.docker.internal` resolves to), or don't publish it and proxy Apache to `http://meal-planner:3000` over the `docker-infra` network. Confirm that Apache's `ProxyPass` appends `X-Forwarded-For` (its default). Verify that `curl http://<pi-lan-ip>:8099/health` from another LAN machine fails, and that the public `/meals/health` still answers
- [ ] 3.2 Add the Apache lines to the `mcp.winterbottom.xyz` vhost (well-known OAuth path plus `/meals/` ProxyPass and ProxyPassReverse). Verify that `httpd -t` passes
- [ ] 3.3 Register `"home-docker/meal-planner": {"scope":"public","match":"/meals/mcp","auth":"mcp"}` in `scripts/tools-index.json`, add a card to the public tools page, and update the home-docker README. Verify that `check-tools-index.py`, `check-service-docs.py` and `check-hosting-security.py` pass locally and in CI

## 4. Go live (on the Pi, with David)

- [ ] 4.1 Create `.env` on the Pi (generate `MCP_API_KEY`, `OAUTH_CLIENT_ID/SECRET`, `OAUTH_APPROVAL_PASSWORD`; add the Flatnotes credentials) and save it to Bitwarden as **Meal Planner .env**. Run `make install` and reload Apache. Verify that `https://mcp.winterbottom.xyz/meals/health` returns 200 and that `/meals/mcp` returns 401 without credentials
- [ ] 4.2 Seed the Flatnotes rule notes by pasting `docs/seed-flatnotes-rules.md` into a Claude chat. Verify that the 4 notes exist in Flatnotes with the expected titles
- [ ] 4.3 Add the claude.ai custom connector `https://mcp.winterbottom.xyz/meals/mcp`, approving with the approval password. Verify in a claude.ai chat that `get_planning_context` returns the rules, the two seeded weeks and next Monday 2026-10-19 (or later)
- [ ] 4.4 Run MCP Inspector against production with `x-api-key`: `get_planning_context`, `save_week_plan` on a scratch future week, `get_week_plan("current")`, `update_day`, then `undo_last_change` until the scratch week is gone. Verify the results and record them in the docker-infra PR

## Workflow follow-up

- Archive this change once the service is live and the connector works.
