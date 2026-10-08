# Meal Planner

Family meal planner: phone web viewer plus an MCP server so Claude can plan, save and read our weekly meal plans.

## Develop

Open in a VS Code **devcontainer** (Reopen in Container) or Codespaces for a
reproducible environment — see [`.devcontainer/`](.devcontainer/).

```bash
npm install
npm run lint                                   # §10 eslint + prettier --check
npm test                                       # §4 tests, 80% coverage floor
```

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

### 2026 — created

- Bootstrapped from the `devcontainer-sandbox` copier template.
