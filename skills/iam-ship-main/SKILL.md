---
name: iam-ship-main
description: >-
  Ship ONLY SamPrimeaux/inneranimalmedia: Worker inneranimalmedia + dashboard/PWA
  on inneranimalmedia.com. Use for deploy:full, deploy:fast, ship:remote, static
  HTML R2 uploads, post-deploy ledgers. NEVER use this skill to deploy the MCP
  worker — that is /iam-ship-mcp.
---

# IAM ship — MAIN (`inneranimalmedia`)

**ONE repo. ONE cwd. Do not open MCP from here.**

| | |
|--|--|
| Repo | `SamPrimeaux/inneranimalmedia` |
| Mac root | `/Users/samprimeaux/inneranimalmedia` |
| GCP root | `/home/samprimeaux/inneranimalmedia` (sparse OK) |
| Live | `https://inneranimalmedia.com` |
| Worker | `inneranimalmedia` |
| Assets R2 | bucket `inneranimalmedia` · prefix `static/dashboard/app/` · shell `static/dashboard/app.html` |
| D1 | `inneranimalmedia-business` · `cf87b717-…` |
| Scope | `workspace_id=ws_inneranimalmedia` · `tenant_id=tenant_sam_primeaux` |

MCP is **`/iam-ship-mcp`** · umbrella index **`/iam-ship`**.

SSOT: `docs/platform/mac-free-ship-lanes-2026-07.md`

## Preflight (required before Mac deploy:full)

```bash
cd /Users/samprimeaux/inneranimalmedia
node scripts/agentsam-ship-check.mjs
# or MCP tool agentsam_ship_check (dual-repo ledger + static validate)
```

Exit 0 = pending migrations are statically clean (or none). Fix `MEMORY_ID_REQUIRED` / validation failures before shipping. Pending-but-valid is informational — do **not** bulk `D1_APPLY_PENDING=apply` the 800–979 gap.

## Host → command

| Host | Command | Never |
|------|---------|-------|
| Mac | `npm run deploy:full` or `deploy:fast` | bare `wrangler deploy` alone (skips SPA/PWA) |
| GCP / phone | `npm run ship:remote` | `deploy:full`, Vite, rclone (OOM) |
| CF Builds | `smart-build` → `deploy:fast:cf` | — |
| Emergency | `ship:remote -- --worker-only` | Expect PWA unchanged |

```bash
cd /Users/samprimeaux/inneranimalmedia   # REQUIRED
git status && git push
npm run deploy:full   # or deploy:fast / on GCP: ship:remote
curl -sS https://inneranimalmedia.com/pwa-build-meta.json
curl -sS https://inneranimalmedia.com/api/health
```

## Post-deploy ledgers (main pipeline)

| Sink | Script |
|------|--------|
| `deployments` | `post-deploy-record.sh` |
| `dashboard_versions` | `post-deploy-record.sh` (deploy:fast critical path; also `deploy-with-record.sh`) |
| `agentsam_memory` | `post-deploy-memory-sync.sh` |
| Worker hooks | `POST /api/internal/post-deploy` |
| CF Builds webhook | `POST /api/webhooks/cloudflare` (`X-Cf-Webhook-Secret` / Bearer `INTERNAL_WEBHOOK_SECRET`) |

## Static HTML (R2 only — no Worker)

`upload-auth-pages.sh`, `upload-legal-pages.sh`, about/contact/spline uploads — `static/pages/` → `pages/…`.  
`cms_site_pages` **dropped** (→ `cms_pages`). Upload scripts do not auto-INSERT CMS rows.

## Security scan

`upload-dashboard-app-r2-prod.sh` aborts on `sk_live_`, `cfut_`, `sk-ant-`, `iam-bridge_`, etc.

## Opt-outs / bans

Opt-out phrases: `local only` · `no commit` · `no push` · `no deploy` · …  
Banned: MCP deploy from this cwd · sandbox/promote lane · full smoke-as-deploy unless asked.
