---
title: "Dashboard Agent — Deploy and R2 Assets"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Deploy and R2 assets

## Canonical paths

| Role | R2 key (bucket `inneranimalmedia`) |
|------|-------------------------------------|
| Vite bundles | `static/dashboard/app/dashboard.js`, `vendor-*.js`, `dashboard.css` |
| Cache-bust | `?v=` from `scripts/bump-cache.js` on `dashboard.js` / `dashboard.css` |
| Shell CSS | `static/dashboard/shell.css` (separate `wrangler r2 object put` in deploy script) |
| SPA fallback HTML | `static/dashboard/app/index.html` |

**Legacy alias:** Worker remaps `/static/dashboard/agent/*` → `static/dashboard/app/*` (`src/core/dashboard-r2-assets.js`). Deploy **must** sync `app/`, not legacy `agent/` only.

## Ship command

```bash
npm run deploy:frontend   # == deploy:full — build + rclone sync + worker deploy
```

**Do not** use `npm run deploy` alone for UI fixes — Worker-only deploy leaves stale chunks.

Pipeline (`scripts/deploy-frontend.sh`):

1. `npm run build:vite-only` → `dashboard/dist/`  
2. `bump-cache.js`  
3. `rclone sync` → `inneranimalmedia/static/dashboard/app/`  
4. `r2-dashboard-manifest-reconcile.mjs`  
5. `wrangler deploy -c wrangler.production.toml`  

Vite `base`: `/static/dashboard/app/` (`dashboard/vite.config.ts`).

## Worker serve chain

```
GET /dashboard/agent
  → getDashboardSpaHtmlShell() (src/index.js + dashboard-r2-assets.js)
  → HTML references /static/dashboard/app/dashboard.js?v=…
GET /static/dashboard/app/*
  → R2 DASHBOARD binding
```

## Validation (required — not `/health` alone)

```bash
# Extract script URLs from live HTML
curl -sS 'https://inneranimalmedia.com/dashboard/agent' | rg -o '/static/dashboard/app/[^"'\'' ]+'

# Each must return HTTP 200
curl -sS -o /dev/null -w '%{http_code}\n' 'https://inneranimalmedia.com/…/dashboard.js?v=…'
```

Playwright: `tests/e2e/dashboard-agent-workbench.spec.ts` (needs `IAM_SESSION`).

## Failure modes

| Flag | Cause |
|------|--------|
| `R2_CHUNK_404` | HTML references hashed chunk not in R2 |
| `BLANK_SCREEN` | JS 404 or runtime `ReferenceError` (barrel `cn` import, etc.) |
| `HEALTH_ONLY_FALSE_SUCCESS` | `/health` 200 while workbench broken |
| Stale docs | `docs/AGENT_DASHBOARD.md` still mentions nested `agent-dashboard/` workspace |

## Cursor gap

Deploy path is documented in repo scripts but **ops ambiguity** (`agent` vs `app` prefixes) still causes production blank shells after worker-only deploys.

## Files

- `scripts/deploy-frontend.sh`  
- `dashboard/vite.config.ts`  
- `src/core/dashboard-r2-assets.js`  
- `docs/agentsam_knowledge/dashboard_r2_asset_deploy_tactics.md`  
