# Review log

Reviews run on this repo (REPO-STANDARDS §9), newest first.
Each line: `- YYYY-MM-DD | <type> | <scope> | <note>`, where `<type>` is
`code-review` or `architecture-review`. Use the `record-review` skill to add entries.

- 2026-10-09 | code-review | add-meal-plan-store-and-mcp (799659c..HEAD) | Independent correctness, test and security critics. No blocking issues. Accepted and fixed: update_day treats null as "not given" (only "" clears); SQLite triggers make history append-only; seeding requires a pristine db so deleted examples never return; trust proxy narrowed from all private ranges to one hop; generic JSON error handler (no stack traces to unauthenticated callers); length caps on tool text and ≤7 days; explicit nulls accepted on defaulted args; added tests for bearer-token /mcp access, wrong approval password, image_only flagging, weeks_back default/bounds, Zurich-time resolution through the tools, full history-prefix immutability, change-after-undo, inclusive list bounds. Deferred to deploy-mcp-to-home-docker: bind the app port so only Apache reaches it, NODE_ENV=production. Deferred upstream: constant-time API-key compare in the shared OAuth module. Rejected: seed weeks being undoable (by spec), Flatnotes without auth (not this deployment).
