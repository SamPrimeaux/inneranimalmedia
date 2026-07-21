---
name: deploy
description: >-
  Deploy Inner Animal Media workers by host and repo. Use when shipping
  inneranimalmedia or inneranimalmedia-mcp-server, choosing deploy:full vs
  ship:remote, verifying pwa-build-meta, or before any wrangler/R2 production push.
---

# Deploy (IAM platform)

**Two repos · two surfaces · never mix roots.**

| Surface | Repo root | Production | Workspace |
|---------|-----------|------------|-----------|
| Main app + dashboard/PWA | `/Users/samprimeaux/inneranimalmedia` | `inneranimalmedia.com` | `ws_inneranimalmedia` · tenant `tenant_sam_primeaux` |
| MCP OAuth / tools | `/Users/samprimeaux/inneranimalmedia-mcp-server` | `mcp.inneranimalmedia.com` | same platform workspace for ops; MCP tokens are workspace-scoped at mint |

D1 (both): `inneranimalmedia-business` · id `cf87b717-d4e2-4cf8-bab0-a81268e32d49`  
SSOT lanes: `docs/platform/mac-free-ship-lanes-2026-07.md` · rule `rule_mac_free_ship_lanes`

## Identity / scope (agents)

- Resolve `workspace_id` / `tenant_id` / `user_id` from session — do **not** invent `ws_*` / `au_*` / `tenant_*` in Worker hot paths.
- This skill’s registry row is scoped to **`ws_inneranimalmedia`** (platform operator deploy).
- Customer workspaces (e.g. fuelnfreetime, companionsofcaddo) may have their own ship profiles — deploy **their** `root_path` / worker name from workspace metadata, not by copying this Mac path.

## Pick command by host (main repo)

| You are on… | Run | Never |
|-------------|-----|-------|
| **Mac** (desk) | `npm run deploy:full` or `npm run deploy:fast` | bare `npm run deploy` for SPA/PWA |
| **GCP iam-tunnel** / phone / remote PTY | `npm run ship:remote` | `deploy:full`, `deploy:fast`, Vite, rclone (OOM) |
| **CF Workers Builds** | `smart-build` then `deploy:fast:cf` | wrangler-per-file R2 loops |
| Emergency worker-only | `npm run ship:remote -- --worker-only` | Expect SPA/PWA unchanged |

### Mac — main (`inneranimalmedia`)

```bash
cd /Users/samprimeaux/inneranimalmedia
# Gate: node --check on touched .js; npm run guard:identity before ship; dashboard → build:vite-only if UI
git status   # commit + push first (ship gate)
npm run deploy:full    # or deploy:fast for critical path
curl -sS https://inneranimalmedia.com/pwa-build-meta.json   # git_sha + cache_bust
curl -sS https://inneranimalmedia.com/api/health
```

### GCP / remote — main

```bash
cd /home/samprimeaux/inneranimalmedia   # or sparse clone path
# clean tree → commit first
npm run ship:remote
# wait CF Builds; verify pwa-build-meta.json git_sha
```

### MCP repo (`inneranimalmedia-mcp-server`)

Separate GitHub repo · separate Worker. **Never** deploy MCP from the main app root.

```bash
cd /Users/samprimeaux/inneranimalmedia-mcp-server
node --check src/index.js
git status && git push   # if shipping code
npm run deploy:full      # scripts/deploy-mcp-worker.sh — Mac/CI with secrets
# Health: https://mcp.inneranimalmedia.com/health (or /api/health per worker)
```

On GCP: prefer that repo’s documented ship path; do **not** run main-app Vite there either.

## Opt-outs (skip commit/deploy only if user said so)

`local only` · `no commit` · `no push` · `no deploy` · `plan only` · `review only` · `question only`

Otherwise: validate → commit → push → deploy by host.

## Do **not** (legacy / banned)

- Old path `…/Downloads/…/inneranimalmedia-agentsam-dashboard`
- `deploy-sandbox.sh` → `promote-to-prod.sh` as the default prod lane (superseded)
- Force-run full Playwright / `smoke:*` / `benchmark-full.sh` **as part of deploy** unless the user asked in the same message
- Mix main Worker deploy with MCP Worker deploy in one command from the wrong cwd
- `deploy:full` on `iam-tunnel`

## Related skills / docs

- Lanes detail: `docs/platform/mac-free-ship-lanes-2026-07.md`
- Cursor always-on: `.cursor/rules/iam-ship-lanes.mdc`, `iam-ship-gate.mdc`
- AST-RAG refresh after big ships (optional): `skill_ast_rag_codebase_index` / `/ast-rag-index`
- Auth HTML-only (no Worker): `./scripts/upload-auth-pages.sh`
- Skills → AutoRAG R2: `./scripts/upload-iam-skills-autorag.sh`

## Proof checklist

1. Correct **repo root** and **host** command
2. `git_sha` on `pwa-build-meta.json` matches pushed main (when dashboard/PWA shipped)
3. MCP health OK when MCP changed
4. No secrets committed (`.env.cloudflare`, tokens)
