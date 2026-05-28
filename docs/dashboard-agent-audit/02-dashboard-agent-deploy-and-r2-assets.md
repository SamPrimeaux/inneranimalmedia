# Chunk 02 — Deploy and R2 static assets

**Status:** Draft

## Purpose
Owns the deploy chain that puts dashboard/dist on R2 so /dashboard/agent loads current JS.

## Live production scope
Stale chunks (404), wrong prefix, dashboard-v marker, sandbox vs prod prefixes. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- scripts/deploy-frontend.sh — DIST=dashboard/dist, PREFIX=static/dashboard/app
- scripts/deploy-sandbox.sh — DIST_DIR=dashboard/dist, R2_AGENT_PREFIX=static/dashboard/agent
- src/core/dashboard-r2-assets.js
- dashboard/vite.config.ts — base /static/dashboard/app/
- docs/AGENT_DASHBOARD.md

## What is ALREADY engineered
Production upload uses dashboard/dist; Worker aliases legacy agent/* URLs to app/*.

## What is PARTIALLY engineered
promote-to-prod.sh may still reference static/dashboard/agent manifest paths.

## What is BROKEN
B02-001 — HTML references missing chunk URLs after partial deploy.

## UX reality today
Users see blank agent or old UI when R2 out of sync with Worker.

## Data / event / execution flow
cd dashboard && npm run build → deploy-frontend → R2 static/dashboard/app → GET /dashboard/agent

## Validation commands
```bash
rg -n "^DIST=|^PREFIX=" scripts/deploy-frontend.sh
rg -n R2_AGENT_PREFIX scripts/deploy-sandbox.sh
rg -n DASHBOARD_STATIC src/core/dashboard-r2-assets.js
curl -s https://inneranimalmedia.com/dashboard/agent | grep -oE '/static/dashboard/app/[^"]+' | head -5
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
| ID | Title | Paths | Expected | Validation |
|----|-------|-------|----------|------------|
| B02-001 | Detect stale R2 dashboard bundles | scripts/deploy-frontend.sh | All chunk URLs 200 | curl + manifest |

## Immediate next implementation step
Add deploy-frontend post-step: verify every script src in built index.html returns 200 on R2.
