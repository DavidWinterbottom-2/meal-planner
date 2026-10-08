# Bootstrap checklist — Meal Planner

`copier` created the files; these steps finish setting the repo up (they need
GitHub, which copier can't touch). Delete this file once done.

## 1. First commit + repo

```bash
git init && git add -A && git commit -m "Bootstrap from devcontainer-sandbox template"
gh repo create DavidWinterbottom-2/meal-planner --private --source . --push
```

## 2. Branch protection (§1)

Make `main` the default, protect it, require a PR + ≥1 approval + green checks:

- GitHub → Settings → Branches (or Rulesets) → protect `main`.

## 3. Secrets

Add these repo secrets (Settings → Secrets and variables → Actions):

- **`CLAUDE_CODE_OAUTH_TOKEN`** — from `claude setup-token`; powers the `claude`
  auto-work label (`.github/workflows/claude.yml`).
- **`TEMPLATE_SYNC_TOKEN`** — PAT used by `template-sync` to pull the shared
  skills AND to push + open its sync PR. It needs `contents:write` +
  `workflows:write` + `pull-requests:write` on this repo and `contents:read` on
  the private `devcontainer-sandbox` template (a classic PAT with the `repo` +
  `workflow` scopes covers both). The `workflow` scope is required because the
  sync updates `.github/workflows/*`, and a PAT-authored PR avoids the "Allow
  GitHub Actions to create and approve pull requests" repo setting.

## 4. First sync

Run the **template-sync** workflow once (Actions → template-sync → Run workflow)
to pull the shared `.claude/skills/` library. Merge the PR it opens.

## 5. Watch it with Hermes (optional)

Add `DavidWinterbottom-2/meal-planner` to Hermes's `TARGET_REPOS` so it's
audited against REPO-STANDARDS each cycle.

## 6. When it should become a running service

Run the **`promote-to-service`** skill — it adds the docker-infra
`docker-compose.yml` service, registers it in `tools-index.json` + the tools-page
card + README, mints a Cloudflare DNS subdomain, and wires Entra SSO if needed.
