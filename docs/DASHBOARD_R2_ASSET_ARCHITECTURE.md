# Dashboard R2 asset architecture

Production dashboard SPA: **one worker**, **one R2 bucket** (`inneranimalmedia`), canonical prefix **`static/dashboard/app/`**.

## Build

| Item | Value |
|------|--------|
| Source | `dashboard/` (Vite) |
| `base` | `/static/dashboard/app/` (`dashboard/vite.config.ts`) |
| Output | `dashboard/dist/dashboard.js`, `dashboard.css`, chunks |
| Shell template | `dashboard/index.html` → built `dashboard/dist/index.html` |

## R2 keys (production)

| Key | Role |
|-----|------|
| `static/dashboard/app/**` | Compiled JS/CSS/chunks (rclone sync from `dist/`) |
| `static/dashboard/app.html` | SPA shell (primary) |
| `static/dashboard/app/index.html` | SPA shell copy |
| `static/dashboard/shell.css` | Global layout CSS |
| `static/dashboard/agent.html` | **Legacy bookmark only** — optional mirror of shell; Worker still falls back here |

Worker resolves legacy `/static/dashboard/agent/*` asset URLs to `static/dashboard/app/*` via `src/core/dashboard-r2-assets.js`.

## Deploy (only lane)

```bash
npm run deploy:full   # scripts/deploy-frontend.sh — Vite build, R2 sync, wrangler deploy
```

Optional: `./scripts/upload-dashboard-app-r2-prod.sh` for R2-only upload.  
Optional legacy mirror: `UPLOAD_DASHBOARD_MIRROR_LEGACY_AGENT=1` duplicates to `static/dashboard/agent/`.

## Removed

- Sandbox worker `inneranimal-dashboard` and bucket `inneranimalmedia-sandbox-cicd` deploy scripts (`deploy-sandbox.sh`, `promote-to-prod.sh`, …) — **deleted from repo**.
- Per-route `dashboard/*.html` MPAs — **deleted**; unified SPA only.

## Services PWA

`services.inneranimalmedia.com` is a separate surface (SW manifest / push). It does not replace dashboard R2 or `deploy:full`.
