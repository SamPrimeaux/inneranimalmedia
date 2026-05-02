# Agent Dashboard (canonical UI)

## What this is

**`agent-dashboard/`** is the **only** supported source for the `/dashboard/agent` experience: the Explorer-style shell, Monaco, and agent column. It replaces the older IAM-only React bundle.

## What it is not

- **Not** “MeauxCAD” or “AITestSuite” as product names. Those are legacy repo or Worker labels. In docs and scripts, say **Agent Dashboard**.
- **`agent-dashboard-legacy/`** holds the **previous** IAM Vite app (`main.jsx`, `AgentDashboard.jsx`, single-file `agent-dashboard.js` output) for reference or emergency rollback. **Do not** use it for new sandbox or production deploys unless you explicitly roll back.

## Git

- **`agent-dashboard/`** is **vendored in this repository** (single clone; no submodule). **Upstream** history may still exist at `https://github.com/SamPrimeaux/meauxcad.git` for reference or cherry-picks.

## Build and deploy

- Build: `cd agent-dashboard && npm ci --include=dev && npm run build` (use `--include=dev` when `NODE_ENV=production` so `vite` is installed).
- Deploy scripts inject `<!-- dashboard-v:N -->` before `</html>` in `dist/index.html` for version checks (`grep dashboard-v` on `/dashboard/agent`).
- Output (npm workspace): `agent-dashboard/agent-dashboard/dist/` (including `assets/` chunks). Sandbox: `./scripts/deploy-sandbox.sh` uploads **all** files under that `dist/` to R2 key prefix `static/dashboard/agent/` and uploads `dist/index.html` as **`static/dashboard/agent.html`** (what the worker serves for `/dashboard/agent`).
- Worker: `worker.js` resolves `/static/dashboard/agent/assets/...` to keys under the Vite `dist/` layout.

## Workers

- **Sandbox dashboard:** `inneranimal-dashboard` — `wrangler.jsonc`, `assets.directory` = `agent-dashboard/agent-dashboard/dist` (monorepo path; Vite app is the nested npm workspace package).
- **Lab worker** historically named `aitestsuite` is separate; do not confuse with the **Agent Dashboard** app source in this repo.

## Sandbox version truth (IAM Explorer)

- **Live URL:** `https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent`
- **Authoritative UI marker:** `<!-- dashboard-v:N -->` in served `agent.html` / `dist/index.html` (check with `curl ... | grep dashboard-v`). **`agent-dashboard/.sandbox-deploy-version`** is the monotonic counter used by `deploy-sandbox.sh` (currently aligned with that `N` after each sandbox deploy).
- **Do not confuse** older **`deployments.version`** values like **v214–v218** on historical D1 rows (earlier counter / different epoch) with the **current** shell; the **current** live worker deployment row for this surface should carry **v6** (or whatever the latest `dashboard-v` is) and is documented in D1 migration **213** on the row `c6d57808-ebf2-4dec-8e3d-a6d585bebef9` unless superseded by a newer deploy.
