# Agent Dashboard (canonical UI)

**Last updated:** 2026-05-28  
**Live URL:** https://inneranimalmedia.com/dashboard/agent  
**UI source (only):** **`dashboard/`** — not `agent-dashboard/` (not in this repo)

## What this is

The **Agent workbench** is implemented in the **`dashboard/`** Vite SPA (`dashboard/App.tsx`). The route `/dashboard/agent` is a client route in that same bundle served from R2 **`static/dashboard/app/`**.

**Audit series:** `docs/dashboard-agent-audit/README.md`

## What it is not

- **LEGACY / NOT SERVED:** `agent-dashboard/`, `AgentDashboard.jsx`, `agent-dashboard.js` — retired; do not build or deploy from those paths.
- **Not** MeauxCAD or AITestSuite as product names in new docs.

## Build and deploy

```bash
cd dashboard && npm ci --include=dev && npm run build   # → dashboard/dist/
npm run deploy:frontend   # repo root → R2 static/dashboard/app/
npm run deploy            # Worker (wrangler.production.toml)
```

Sandbox: `./scripts/deploy-sandbox.sh` (same `dashboard/dist`, prefix `static/dashboard/agent/`).

Worker static aliases: `src/core/dashboard-r2-assets.js`.

## Verify

```bash
curl -sI https://inneranimalmedia.com/dashboard/agent | head -3
curl -s https://inneranimalmedia.com/dashboard/agent | grep -oE 'dashboard-v:[0-9]+' | head -1
npx playwright test tests/e2e/dashboard-agent-workbench.spec.ts
```

## Related documentation

- **`docs/dashboard-agent-audit/`** — live `/dashboard/agent` audit series (primary)
- **`docs/agent-workbench-audit/`** — earlier chunk draft; superseded by `dashboard-agent-audit` naming
