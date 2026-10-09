# Design

## Context

The `flatnotes-mcp` and `my-sweepy` services in docker-infra are the precedents:

- a GHCR image built in the app repo, pulled by a compose file in `docker-infra/home-docker/services/<name>/`
- Apache on the Pi proxying `host.docker.internal:<port>`
- tools-index registration enforced by CI.

Host ports 8090–8098 and 8100 are taken. The Apache container is itself on the `docker-infra` network, so it can reach `meal-planner:3000` by name without any host port. HOSTING-SECURITY §H3 says a protected app publishes no host ports, and change 1's security review found that a directly reachable app port lets a caller forge `X-Forwarded-For`.

## Goals / Non-Goals

**Goals:** copy the existing MCP deployment exactly, so nothing about routing or auth is new.

**Non-Goals:** the viewer hostname and Entra (add-week-viewer).

## Decisions

**Image.**

- Multi-stage `node:22-bookworm-slim` build: `npm ci --omit=dev`, then copy `src/`.
- Run as the non-root `node` user, with a healthcheck on `/health`.
- Use the bookworm (glibc) base, not alpine, so better-sqlite3's prebuilt linux-arm64 binary is used without compiling.
- _Alternative:_ alpine with build tools. It's slower, more fragile cross-arch builds under QEMU.

**CI.** `build.yml`, adapted from mcp-development's `build-flatnotes-mcp.yml`:

- QEMU and buildx, `platforms: linux/arm64`, push on `main`.
- Tags `latest`, the `package.json` version, and `sha-<short commit>`. The `sha-` tag is what a rollback pins with `IMAGE_TAG`, because a version tag can be rebuilt from a later commit that didn't bump it.
- [Likely] An arm64 build under QEMU takes several minutes, mostly `npm ci` compiling `better-sqlite3` if no prebuilt binary matches. Cache the npm layer with the buildx GHA cache.

**Compose.**

- `image: ghcr.io/davidwinterbottom-2/meal-planner:${IMAGE_TAG:-latest}`, `TZ=Europe/Zurich`, `MEALS_DB=/data/meals.db`.
- Volume `${MEALS_DATA_PATH:-./data}:/data`. The image runs as the non-root `node` user (uid 1000), so the host directory must be owned by uid 1000 (`make install` creates it with `install -d -o 1000 -g 1000`); otherwise SQLite fails to open the database on first start.
- Joins the `docker-infra` network so `http://flatnotes:8080` resolves.
- Log rotation as in the other services.

**Apache.** In the `mcp.winterbottom.xyz` :443 vhost, add these next to the chores lines:

- `ProxyPass /.well-known/oauth-authorization-server/meals http://meal-planner:3000/.well-known/oauth-authorization-server disablereuse=On`
- `ProxyPass /meals/ http://meal-planner:3000/ disablereuse=On` and the matching `ProxyPassReverse`.

**No host port for the app.** The app `expose`s 3000 on `docker-infra` and publishes nothing; Apache proxies to it by container name. This departs from the other MCP services, which use `host.docker.internal:<port>`, for two reasons. It satisfies §H3, and it means only Apache can reach the app, which is what `trust proxy: 1` relies on. **[Open, architecture review finding 1]** The `docker-infra` network is flat, so every other container on it can also reach `meal-planner:3000`. "Only Apache" holds for the host and the LAN, not for neighbouring containers; the decision on how to close that is pending with David. _Alternative:_ publish `8099` bound to the Docker bridge only. Rejected: it still opens a host port, and it depends on the bridge address.

**Authentication of the MCP surface (HOSTING-SECURITY §H2).** §H2 makes Microsoft Entra the one identity provider, but claude.ai's custom connectors can only do dynamic client registration plus PKCE, which Entra doesn't offer them. The MCP surface therefore uses the shared OAuth module (`auth: "mcp"`, already in the §H2 vocabulary for exactly this reason), gated by the approval password and `x-api-key`. It is the same mechanism as every other MCP server on `mcp.winterbottom.xyz`.

**OAuth state lives in memory.** The shared module keeps registered clients, codes and access tokens in memory. Every redeploy or Watchtower update therefore drops them, and the claude.ai connector must be re-authorised (Disconnect, Connect, enter the approval password). This is the same behaviour as the other MCP servers. It is documented in the README rather than fixed here, because the fix belongs in the shared module.

**Container recreation and Apache's cached address.** [Likely] Apache keeps the address it resolved for `meal-planner` together with its pooled connections. When Watchtower or a redeploy recreates the container, Docker may give it a new address, and Apache would then return 502 until it is reloaded. The `host.docker.internal:<port>` services can't hit this, because their target never changes.

- **Mitigation:** `disablereuse=On` on both meals `ProxyPass` lines. Apache then opens a fresh connection per request and keeps no pool tied to the old address. At meals' traffic (a handful of requests a day) this costs nothing.
- **Unverified:** [Guessing] whether this also forces Apache to re-resolve the name. The deploy tasks include a recreate-the-container check to settle it.
- **If that check fails:** pin the container's address on `docker-infra` (this needs a fixed subnet), or fall back to the bridge-bound port with a recorded §H3 exception. Pinning is deliberately not done up front.

`BASE_URL=https://mcp.winterbottom.xyz/meals`. If the docker-infra Apache stopgap (basic auth on `/*/oauth/authorize`) has landed, its `LocationMatch` covers `/meals/` automatically.

**tools-index.** Register as public with `match: "/meals/mcp"` and `auth: "mcp"` now. `add-week-viewer` revisits the entry when the viewer hostname exists.

## Risks / Trade-offs

- [The connector is added before the OAuth fix is deployed] → Task 1.1 gates on `OAUTH_APPROVAL_PASSWORD` being set and enforced.
- [The SQLite file sits on the Pi's SD card with no backup] → Accepted for now; recorded in both READMEs.

## Migration Plan

1. Merge the image CI and confirm the image exists in GHCR.
2. Merge the docker-infra PR.
3. On the Pi: create `.env` (store it in Bitwarden as **Meal Planner .env**), run `make install`, reload Apache.
4. Add the connector in claude.ai.

Rollback: `docker compose down`, and revert the vhost lines.
