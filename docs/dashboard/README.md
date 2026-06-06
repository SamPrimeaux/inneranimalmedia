# Dashboard — production architecture

**One worker, one repo, one deploy lane.**

| What | Where |
|------|--------|
| Worker | `src/index.js` → `wrangler.production.toml` (`inneranimalmedia.com`) |
| React SPA source | `dashboard/` (Vite + React Router in `App.tsx`) |
| Build output | `dashboard/dist/` (`dashboard.js`, `dashboard.css`, chunks) |
| R2 prefix | `static/dashboard/app/` (bucket `inneranimalmedia`) |
| HTML shell (R2) | `static/dashboard/app.html`, `static/dashboard/app/index.html` |
| Deploy | `npm run deploy:full` → `scripts/deploy-frontend.sh` |

## Routing

- All `/dashboard/*` URLs require session auth, then receive the **same SPA shell**.
- React Router in `dashboard/App.tsx` picks the page (`/dashboard/agent`, `/dashboard/overview`, …).
- Worker: `src/index.js` + `src/core/dashboard-r2-assets.js` (`getDashboardSpaHtmlShell`, legacy `/static/dashboard/agent/*` → `app/*` alias).

## `/dashboard/agent`

| Layer | File / artifact |
|-------|-----------------|
| Layout | `dashboard/App.tsx` when `isAgentShellPath()` |
| Chat | `dashboard/components/ChatAssistant/` |
| Workspace home | `dashboard/components/WorkspaceDashboard.tsx` |
| Explorer / MovieMode | `LocalExplorer`, `features/moviemode/MovieModeStudio.tsx` |

## Removed (do not restore)

- **Sandbox worker** `inneranimal-dashboard.meauxbility.workers.dev` — discontinued.
- **Scripts:** `deploy-sandbox.sh`, `promote-to-prod.sh`, `upload-repo-to-r2-sandbox.sh`, etc.
- **Legacy HTML:** per-route `dashboard/*.html` MPAs and `dashboard/pages/agent.html` fragment — superseded by the unified SPA.

## Services PWA

`services.inneranimalmedia.com` is a **separate worker** (manifest + push control plane). It does not host the dashboard SPA. See `docs/platform/pwa-service-worker-platform-spec-2026-06.md`.
