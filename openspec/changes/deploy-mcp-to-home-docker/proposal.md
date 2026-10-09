# Proposal

## Why

The MCP server from `add-meal-plan-store-and-mcp` only helps once it runs on the Pi and claude.ai can connect to it. Deploying the MCP server alone, before the viewer, means Claude can start saving real plans immediately. It is also a precondition for the tool-image spike in `add-lisa-image-upload`, which needs a reachable connector.

## What Changes

- A `Dockerfile` (multi-arch, `linux/arm64` for the Pi) and a GitHub Actions workflow that builds and pushes `ghcr.io/davidwinterbottom-2/meal-planner` on pushes to `main`.
- A new docker-infra service, `home-docker/services/meal-planner/`. It covers:
  - compose on the `docker-infra` network
  - no host port: Apache reaches the app as `meal-planner:3000` over the `docker-infra` network (HOSTING-SECURITY §H3)
  - a `/data` volume for SQLite
  - a `.env.example`
  - a README
- Apache on the `mcp.winterbottom.xyz` vhost: `ProxyPass /meals/` plus `/.well-known/oauth-authorization-server/meals`, following the flatnotes and chores pattern.
- tools-index: `"home-docker/meal-planner": { scope: public, match: "/meals/mcp", auth: "mcp" }`, plus a card on the public tools page and a home-docker README entry.
- Connecting the claude.ai custom connector, and seeding the 4 Flatnotes rule notes with the paste-in prompt.

## Non-goals

- `meals.winterbottom.xyz`, Entra, DNS (that's `add-week-viewer`).
- Backups (a known gap).

## Capabilities

### New Capabilities

None. This change is deployment only. The MCP behaviour is specified in `planning-mcp`, so `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- Repos: `meal-planner` (Dockerfile, CI) and `docker-infra` (a new service, the Apache vhost, `tools-index.json`, the tools page, the home-docker README). The docker-infra CI checks `check-tools-index`, `check-service-docs` and `check-hosting-security` must pass.
- Depends on the mcp-development OAuth consent fix being deployed (`OAUTH_APPROVAL_PASSWORD` in `.env`).
