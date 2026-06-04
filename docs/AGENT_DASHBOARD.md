# Agent Dashboard (canonical UI)

**Last updated:** 2026-05-28  
**Canonical source:** **`dashboard/`** (package `inneranimalmedia-dashboard`)  
**Live route:** `https://inneranimalmedia.com/dashboard/agent` (same React SPA as other `/dashboard/*` routes)

---

## What this is

The **Agent workbench** is the Explorer-style IDE shell in the IAM dashboard: activity sidebar (files, GitHub, search), center tabs (Workspace, Monaco, BrowserView, Draw, MovieMode), and the **ChatAssistant** column. Implementation lives in **`dashboard/App.tsx`** and related components under **`dashboard/components/`**.

| Concern | Live path |
|---------|-----------|
| SPA entry / routing | `dashboard/App.tsx`, `dashboard/lib/agentRoutes.ts` |
| Agent chat | `dashboard/components/ChatAssistant/` |
| Browser panel | `dashboard/components/BrowserView.tsx` |
| Files + R2 + embedded GitHub | `dashboard/components/LocalExplorer.tsx` |
| GitHub repos sidebar (`actions` rail) | `dashboard/components/GitHubExplorer.tsx` |
| Workbench audit (chunk series) | `docs/agent-workbench-audit/` |

---

## What it is not

- **Not** a separate `agent-dashboard/` package — that directory **does not exist** in this monorepo. Older docs and audits that reference `agent-dashboard/src/AgentDashboard.jsx` describe a **retired layout** (single-bundle agent app).
- **Not** “MeauxCAD” or “AITestSuite” as product names in new docs — those are legacy Worker/repo labels. Say **Agent Dashboard** or **agent workbench**.
- **Not** only the legacy HTML shell `dashboard/agent.html` — production serves the **full dashboard SPA** from R2; `/dashboard/agent` is a **client route** inside `dashboard/App.tsx`.

---

## Build

From repo root:

```bash
cd dashboard
npm ci --include=dev   # when NODE_ENV=production, include devDeps so Vite is available
npm run build
```

**Output:** `dashboard/dist/` (Vite bundle, `index.html`, hashed chunks under `assets/`).

**Vite base URL:** `/static/dashboard/app/` — see `dashboard/vite.config.ts`.

**Local dev:**

```bash
cd dashboard && npm run dev
# http://localhost:3000 — /api proxied to Worker :8787
```

---

## Deploy (production)

**Full dashboard frontend (includes `/dashboard/agent`):**

```bash
# repo root
npm run deploy:frontend
```

**Script:** `scripts/deploy-frontend.sh`

| Setting | Value |
|---------|--------|
| Build input | `dashboard/dist` |
| R2 bucket | `inneranimalmedia` (production) |
| Canonical prefix | **`static/dashboard/app/`** |

Also publishes short-path shells where needed (e.g. `static/dashboard/shell.css`, `static/dashboard/iam-workspace-shell.html`).

**Worker-only** (no UI change): `npm run deploy` / `npm run deploy:worker` — `wrangler.production.toml`.

---

## Deploy (sandbox)

```bash
./scripts/deploy-sandbox.sh
```

| Setting | Value |
|---------|--------|
| Build input | `dashboard/dist` (`DIST_DIR` in script) |
| Sandbox bucket | `inneranimalmedia-sandbox-cicd` (override `SANDBOX_BUCKET`) |
| Upload prefix | `static/dashboard/agent/` (sandbox script) |
| Version file | `dashboard/.sandbox-deploy-version` |

Promote sandbox → production: `docs/runbooks/deploy-dashboard.md`, `scripts/promote-to-prod.sh`.

---

## How the Worker serves assets

**File:** `src/core/dashboard-r2-assets.js`

- **Canonical R2 keys:** `static/dashboard/app/*` (matches Vite `base`).
- **Legacy URLs:** requests to `static/dashboard/agent/*` are **aliased** to the same objects under `app/` until bookmarks expire.
- **SPA HTML shell:** tried in order — `static/dashboard/app.html`, `static/dashboard/app/index.html`, legacy `static/dashboard/agent.html`, etc.

Authenticated `/dashboard/*` routes receive the SPA shell from the **DASHBOARD** R2 binding (`inneranimalmedia` in production).

---

## Verify production

```bash
# SPA loads
curl -sI https://inneranimalmedia.com/dashboard/agent | head -5

# Version marker (when injected in built index.html)
curl -s https://inneranimalmedia.com/dashboard/agent | grep -oE 'dashboard-v:[0-9]+' | head -3

# Chunk URLs referenced in HTML should be 200 (not 404 under /static/dashboard/app/)
curl -s https://inneranimalmedia.com/dashboard/agent | grep -oE '/static/dashboard/app/[^"'\'' ]+' | head -5
```

**E2E:** `npx playwright test tests/e2e/dashboard-agent-workbench.spec.ts`

**Health:** Worker `/health` includes `browser: !!env.MYBROWSER` for Browser Rendering tools used by `BrowserView` automation (see `docs/agent-workbench-audit/chunk-01-agent-shell-and-browser.md`).

---

## Workers (do not confuse)

| Worker / config | Role |
|-----------------|------|
| **`inneranimalmedia`** | Production IAM Worker — `wrangler.production.toml`, `src/index.js` |
| **`inneranimal-dashboard`** | Sandbox dashboard worker — `wrangler.jsonc` |
| **Lab `aitestsuite`** | Separate; not the Agent Dashboard source tree |

---

## Path migration (old → current)

| Old (retired) | Current |
|---------------|---------|
| `agent-dashboard/` | **`dashboard/`** |
| `agent-dashboard/src/AgentDashboard.jsx` | **`dashboard/App.tsx`** + `dashboard/components/*` |
| `agent-dashboard/dist/agent-dashboard.js` | Vite chunks in **`dashboard/dist/assets/`** (entry name from build, e.g. `dashboard.js`) |
| R2 `static/dashboard/agent/agent-dashboard.js` | R2 **`static/dashboard/app/*`** (legacy `agent/` URLs alias to `app/`) |
| `cd agent-dashboard && npm run build` | **`cd dashboard && npm run build`** |
| `./agent-dashboard/deploy-to-r2.sh` | **`npm run deploy:frontend`** or **`./scripts/deploy-sandbox.sh`** |

---

## Related documentation

- **Workbench audit (live code):** `docs/agent-workbench-audit/README.md`
- **Deploy runbook:** `docs/runbooks/deploy-dashboard.md`
- **R2 asset architecture:** `docs/DASHBOARD_R2_ASSET_ARCHITECTURE.md` (if present; else `src/core/dashboard-r2-assets.js`)
- **Historical audits** referencing `agent-dashboard/`: see banner at top of those files; prefer this doc + audit chunks for repair work.

---

## Git / upstream

This repo ships **`dashboard/`** in the main **inneranimalmedia** monorepo. Historical MeauxCAD upstream (`meauxcad.git`) may still be useful for cherry-picks; do not assume its folder layout matches this tree without diffing.
