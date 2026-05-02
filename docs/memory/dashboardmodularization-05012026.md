# Dashboard modularization and R2 consolidation (2026-05-01)

## Summary

Production dashboard static assets and the `DASHBOARD` Workers binding now target a single R2 bucket, **`inneranimalmedia`**, instead of the legacy **`agent-sam`** bucket. Canonical keys for the Vite-built agent shell and bundle:

| Object | R2 key |
|--------|--------|
| SPA shell HTML | `dashboard/app/agent.html` |
| JS bundle | `dashboard/app/agent-dashboard.js` |
| CSS bundle | `dashboard/app/agent-dashboard.css` |
| Extra chunks from `dist/` | `dashboard/app/<filename>` |

The Worker resolves browser URLs under `/static/dashboard/agent/*` by reading `dashboard/app/<relative path>` first (then legacy keys for transition).

## Configuration

- **`wrangler.production.toml`** and **`wrangler.jsonc`**: `[[r2_buckets]]` / `r2_buckets` entry with `binding = "DASHBOARD"` uses `bucket_name = "inneranimalmedia"`.
- **`ASSETS`** binding also uses `inneranimalmedia` for marketing and auth HTML (`pages/auth/*`).

## Scripts updated

- **`scripts/promote-agent-dashboard-to-production.sh`** — uploads to `inneranimalmedia/dashboard/app/…` and syncs additional `dist/` artifacts.
- **`scripts/promote-to-prod.sh`** — `PROD_BUCKET=inneranimalmedia`.
- **`scripts/deploy-with-record.sh`** — dashboard uploads and source/doc mirrors use `inneranimalmedia/…` (e.g. `static/source/…` for worker and repo mirrors).
- **`scripts/deploy-cf-builds-prod.sh`**, **`upload-plan-to-r2.sh`**, **`upload-playwright-report-to-r2.sh`**, **`upload-agent-page-to-r2.sh`**, **`validate-overnight-setup.js`**, **`overnight.js`** — bucket name aligned where they write to the dashboard/report paths.

## Auth

- Password reset: **`POST /api/auth/password-reset/request`**, **`POST /api/auth/password-reset/confirm`** (`src/api/auth.js`), KV `SESSION_CACHE` for short-lived codes, Resend from **`hey@inneranimalmedia.com`**.
- **`pages/auth/reset.html`** — three-step flow (request code, verify + new password, success).

## Frontend

- **`MeetPage.tsx`** moved from `app/pages/` to **`components/MeetPage.tsx`**; **`App.tsx`** imports `./components/MeetPage`.

## Deprecation

- **`agent-sam`** as the DASHBOARD target is deprecated; existing objects may remain until migrated or TTL’d. New uploads for dashboard app shell and bundle go to **`inneranimalmedia/dashboard/app/`** only.
