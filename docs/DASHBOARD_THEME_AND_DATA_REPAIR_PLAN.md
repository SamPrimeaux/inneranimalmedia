# Dashboard theme and data repair plan

Strategic plan to repair theme logic and data connections across all dashboard pages. Execute in order to avoid lost work.

---

## 1. Theme logic (all pages)

Every dashboard page must have:

- **Early script** in `<head>`: read `localStorage.getItem('dashboard-theme')` and set `document.documentElement.setAttribute('data-theme', t)`.
- **Optional API script** (for pages with shell/topbar): fetch `GET /api/settings/theme` and `GET /api/themes`, inject `[data-theme="slug"]{ --bg-nav:...; ... }` and set `data-theme` + localStorage. (Already in `agent.html`.)
- **CSS**: `:root` and `[data-theme="meaux-glass-blue"]`, `[data-theme="inneranimal-slate"]`, `[data-theme="meaux-mono"]` blocks defining `--bg-nav`, `--text-nav`, `--bg-canvas`, `--bg-elevated`, etc. Either inline or via `/static/dashboard/shell.css` + shared theme CSS.

Reference: `docs/theme-logic.md` (also in R2 at `agent-sam/docs/theme-logic.md`).

---

## 2. Pages in repo (fix locally, then upload)

| Page | File | Action |
|------|------|--------|
| Agent | `dashboard/agent.html` | ✅ Already has full theme (early script + API script + theme blocks). |
| Overview | `dashboard/overview.html` | Has early script + theme blocks. Add **API script** (same as agent) so API-driven slugs work. |
| Cloud | `dashboard/cloud.html` | Has early script + theme blocks. Add **API script**. |
| Finance | `dashboard/finance.html` | Has early script + theme blocks. Add **API script**. |
| Time-tracking | `dashboard/time-tracking.html` | Check for early script + theme blocks; add API script if missing. |
| Chats | `dashboard/chats.html` | Check for early script + theme blocks; add API script if missing. |
| MCP | `dashboard/mcp.html` | Check for early script + theme blocks; add API script if missing. |

After editing: run `agent-dashboard/deploy-to-r2.sh` (or upload changed HTML to `agent-sam/static/dashboard/<page>.html` with `--remote`).

---

## 3. Pages only in R2 (pull → edit → push)

These are served from R2 at `static/dashboard/<segment>.html` but are **not** in the repo. To repair:

1. **Pull** from R2:  
   `./scripts/with-cloudflare-env.sh npx wrangler r2 object get agent-sam/static/dashboard/<segment>.html --remote --file=/tmp/<segment>.html -c wrangler.production.toml`
2. **Edit** the file: add the same `<head>` early script (and optionally the API script) and ensure theme CSS variables exist (or link to shell.css + a theme stylesheet).
3. **Push** back:  
   `./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/<segment>.html --file=/tmp/<segment>.html --content-type=text/html --remote -c wrangler.production.toml`
4. Optionally copy into repo `dashboard/<segment>.html` and add to `deploy-to-r2.sh` for future deploys.

| Segment | Notes |
|---------|--------|
| **billing** | Theme + **DB**: ensure page calls `GET /api/billing/summary` and renders metrics (Paid This Month, Upcoming, Variable/Usage). Worker already has `/api/billing/summary`; wire the page to it so values show instead of "—". |
| **clients** | Theme + **DB**: ensure page uses `GET /api/clients` and `POST /api/clients` for list and CRUD. Worker has these routes; wire UI. |
| **tools** | Theme only (Dev Tools page). |
| **calendar** | Theme only. |
| **images** | Theme + **Cloudflare Images CRUD**: ensure worker has env for Images API (see below). |
| **draw** | Theme only. |
| **meet** | Theme first; then design/connection to live stream (per user, do after theme). |
| **kanban** | Theme only. |
| **cms** | Theme only. |
| **mail** | Theme only. |
| **pipelines** | Theme only. |
| **onboarding** | Theme only. |
| **user-settings** | Theme only (and ensure it saves to `PATCH /api/settings/theme` + localStorage). |

---

## 4. Billing: DB metrics

- **API**: `GET /api/billing/summary` (worker) returns subscription/cost data. Ensure the billing page (or its script) calls this and displays:
  - Monthly subscriptions (fixed)
  - Paid this month
  - Upcoming this month
  - Variable / usage
- **Source**: D1 `spend_ledger`, subscription tables, etc. (see worker implementation of `/api/billing/summary`).

---

## 5. Clients: DB connection

- **APIs**: `GET /api/clients`, `POST /api/clients` (worker). Ensure the clients page fetches and renders the list and uses POST for create/update.
- **D1**: `clients` table.

---

## 6. Images: Cloudflare Images CRUD

For full CRUD (list, upload, get, delete) the worker needs:

- **Env / secrets** (in Cloudflare dashboard or wrangler):
  - **Account ID**: `CLOUDFLARE_ACCOUNT_ID` (or `CF_ACCOUNT_ID`).
  - **API Token** with **Cloudflare Images: Edit** (create, list, delete, update). Store as `CLOUDFLARE_IMAGES_API_TOKEN` or `CF_IMAGES_API_TOKEN`.
- **API base**: `https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/images/v1`.
- **Endpoints**: List images, Create (upload), Get image details, Delete. Use the token in `Authorization: Bearer <token>`.
- Ensure dashboard/images page calls worker routes that proxy to Cloudflare Images API and that the page has theme logic (early script + theme CSS).

---

## 7. Execution order (no lost work)

1. **Repo pages**: Add API theme script to overview, cloud, finance, time-tracking, chats, mcp (one at a time; test; then upload that page to R2).
2. **R2-only pages**: Pull each HTML, add theme script (+ theme CSS if missing), push back. Then wire billing/clients/images as above.
3. **Billing**: After theme, wire `GET /api/billing/summary` and render metrics.
4. **Clients**: After theme, wire `GET /api/clients` and `POST /api/clients`.
5. **Images**: After theme, confirm env and worker routes for Cloudflare Images; then ensure UI uses them for full CRUD.

---

*Created 2026-03-09. Update this plan as items are completed.*
