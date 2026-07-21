---
name: iam-platform-ship
description: >-
  Ship the IAM platform workers: SamPrimeaux/inneranimalmedia (inneranimalmedia.com
  Worker + dashboard/PWA R2) and SamPrimeaux/inneranimalmedia-mcp-server
  (mcp.inneranimalmedia.com). Use for deploy:full, deploy:fast, ship:remote,
  auth/static HTML R2 uploads, post-deploy D1 ledgers, or choosing Mac vs GCP vs
  CF Builds. Not for customer app deploys unless their workspace ship profile says so.
---

# IAM platform ship — main + MCP

**What this skill deploys (only these surfaces):**

| Surface | Repo | Root (Mac) | Live URL | Worker / assets |
|---------|------|------------|----------|-----------------|
| **Main app** | `SamPrimeaux/inneranimalmedia` | `/Users/samprimeaux/inneranimalmedia` | `inneranimalmedia.com` | Worker `inneranimalmedia` + R2 bucket `inneranimalmedia` (`static/dashboard/**`, PWA) |
| **MCP** | `SamPrimeaux/inneranimalmedia-mcp-server` | `/Users/samprimeaux/inneranimalmedia-mcp-server` | `mcp.inneranimalmedia.com` | Separate Worker — **never** from main repo cwd |

**Scope:** `workspace_id=ws_inneranimalmedia` · `tenant_id=tenant_sam_primeaux` · D1 `inneranimalmedia-business` (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`)  
SSOT lanes: `docs/platform/mac-free-ship-lanes-2026-07.md` · `rule_mac_free_ship_lanes`

Not in scope: fuelnfreetime / companionsofcaddo / other customer workers — use that workspace’s `root_path` + ship profile.

---

## Host → command (main repo)

| Host | Command | Ships |
|------|---------|--------|
| **Mac** | `npm run deploy:full` (`scripts/deploy-frontend.sh`) or `deploy:fast` | Vite → R2 `static/dashboard/app` + PWA → wrangler → post-deploy hooks |
| **GCP iam-tunnel / phone** | `npm run ship:remote` | Push → **CF Builds** (Vite + R2 delta + wrangler). **Never** Vite/`deploy:full` on the ~1GB VM |
| **CF Builds** | `smart-build` → `deploy:fast:cf` | Same fast path; Vite already done |
| Emergency | `ship:remote -- --worker-only` | Worker only — SPA/PWA unchanged |

Bare `npx wrangler deploy` alone does **not** refresh SPA/PWA. Prefer pipeline scripts. Manual wrangler is OK only for true worker-only emergencies (and say so).

### Mac — main

```bash
cd /Users/samprimeaux/inneranimalmedia
# node --check on touched .js; npm run guard:identity; UI → build:vite-only if validating alone
git status && git push   # ship gate: commit+push before/with deploy
npm run deploy:full      # or deploy:fast
curl -sS https://inneranimalmedia.com/pwa-build-meta.json   # git_sha + cache_bust
curl -sS https://inneranimalmedia.com/api/health
```

### GCP — main

```bash
cd /home/samprimeaux/inneranimalmedia
npm run ship:remote
# wait Builds; verify pwa-build-meta.json
```

### MCP repo

```bash
cd /Users/samprimeaux/inneranimalmedia-mcp-server
node --check src/index.js
npm run deploy:full    # scripts/deploy-mcp-worker.sh
```

---

## What `deploy:full` / fast still write (post-upload ledgers)

These replaced the old one-liner “INSERT deployments / dashboard_versions / UPDATE agentsam_memory” — same intent, current scripts:

| Sink | Who writes | Notes |
|------|------------|--------|
| D1 `deployments` | `scripts/post-deploy-record.sh` (queued from `deploy:fast` / full path) | One row per ship |
| D1 `dashboard_versions` | `deploy-with-record.sh` / full dashboard R2 path | js/css/html hashes under `static/dashboard/app/**` |
| D1 `agentsam_memory` | `scripts/post-deploy-memory-sync.sh` (from `deploy-frontend.sh`) | Structured deploy fact (no LLM required) |
| Supabase `agentsam_deploy_events` | post-deploy-record / memory-sync when keys present | Non-fatal if unset |
| Worker hooks | `POST /api/internal/post-deploy` | KV + `agentsam_hook` post_deploy |

Canonical dashboard R2 prefix: **`static/dashboard/app/`** (not legacy `dashboard/app/` or `static/dashboard/agent/`). Shell: `static/dashboard/app.html`.

Optional dashboard-only R2: `npm run r2:upload:dashboard-app-prod` → `scripts/upload-dashboard-app-r2-prod.sh`.

---

## Static / marketing HTML (R2 only — no Worker redeploy)

Old `upload-public-pages.sh` / `upload-dashboard-prod.sh` **do not exist**. Use:

| Content | Script | Source → R2 key |
|---------|--------|-----------------|
| Auth | `./scripts/upload-auth-pages.sh` | `static/pages/auth/*.html` → `pages/auth/{login,signup,reset}.html` |
| Legal | `./scripts/upload-legal-pages.sh` | `static/pages/{privacy,terms}/` → `pages/...` |
| About / contact / marketing | `upload-about-page.sh`, `upload-contact-page.sh`, `upload-spline-scenes.sh`, … | under `static/pages/` → `pages/...` |

Bucket: **`inneranimalmedia`**.  
**CMS registry:** `cms_site_pages` was **dropped** (migration 627 → canonical **`cms_pages`**). Static marketing HTML uploads are R2-only; richer CMS/dashboard pages live in `cms_pages` (+ drafts/sections), not auto-inserted by `upload-*-page.sh`.

---

## Pre-deploy security scan (still live)

`scripts/upload-dashboard-app-r2-prod.sh` (and related bundle checks) abort if secrets-shaped strings appear in the upload set, e.g. `sk_live_`, `cfut_`, `sk-ant-`, `iam-bridge-`, plus other high-signal patterns. Prefer `grep … \|\| true` patterns so zero matches don’t trip `pipefail`.

---

## CF Builds + deploy webhook (still live)

- **Remote ship:** `git push` → Cloudflare Workers Builds → Vite + R2 delta + wrangler (`deploy:fast:cf`).
- **Webhook:** `POST https://inneranimalmedia.com/api/webhooks/cloudflare`  
  Auth: `X-Cf-Webhook-Secret` or `Authorization: Bearer …` = `INTERNAL_WEBHOOK_SECRET` (see `src/api/webhooks/cloudflare.js`).  
  Ingests build/deploy events (not the old `X-CF-Signature` / `DEPLOY_TRACKING_TOKEN` story — that token is for `/api/deployments/log` via `scripts/deploy.sh`).
- Set **`PUSH_SERVICE_TOKEN`** on Builds so PWA/SW ingest stays in sync.

---

## Opt-outs

`local only` · `no commit` · `no push` · `no deploy` · `plan only` · `review only` · `question only`

Else: validate → commit → push → deploy by host.

## Banned / superseded

- `…/Downloads/…/inneranimalmedia-agentsam-dashboard`
- Default lane = `deploy-sandbox.sh` → `promote-to-prod.sh`
- `deploy:full` / Vite / rclone on `iam-tunnel`
- Mixing MCP deploy from main repo root
- Auto-running full Playwright / `smoke:*` / `benchmark-full` **inside** deploy unless user asked

## Proof

1. Right **repo** + **host** command  
2. `pwa-build-meta.json` `git_sha` / `cache_bust` when dashboard/PWA shipped  
3. MCP health when MCP changed  
4. No secrets in git  

Related: `skill_ast_rag_codebase_index` · AutoRAG upload `./scripts/upload-iam-skills-autorag.sh`
