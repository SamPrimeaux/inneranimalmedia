# Failure Summary: 2026-03-03 Dashboard Breakage and Revert

**Date:** 2026-03-03  
**Impact:** Full dashboard broken (all routes serving wrong or broken content).  
**Root cause:** Worker was changed to rewrite dashboard HTML in-flight for `/dashboard/finance` (and fallbacks for billing/clients), which broke the entire dashboard.

---

## What Happened (Timeline)

1. **Initial ask:** Fix Finance/Billing/Clients so they use the new JSX from R2 and show the rebuilt pages inside the dashboard shell.

2. **First failure:** Raw JSX was served for `/dashboard/finance` (and billing/clients) instead of HTML. User saw source code.

3. **Second failure:** Worker was “fixed” by serving `static/dashboard/${segment}.html` from R2 for all routes. No segment-specific HTML existed in R2 for finance/billing/clients, so those routes 404’d or depended on missing `jsx-shell.html`.

4. **Third failure:** Agent added “factoring in” logic: fallback to a shared `jsx-shell.html` with placeholders and/or special handling for finance/billing/clients. Still not the desired behavior; user repeated that the shell must load the JSX properly.

5. **Fourth failure:** User asked to “rebuild finance html” and deploy. Agent added worker logic that, for `/dashboard/finance` only, fetched `overview.html` from R2, did string replacements (overview-root → finance-root, etc.), and replaced the Overview script tag with a script that loaded Finance.jsx via esm.sh and mounted it. **This was applied for finance only**, but the same request path is used for the whole dashboard shell.

6. **Fifth failure / Full break:** The “rebuilt finance” deploy went live. The in-worker rewrite either:
   - Broke the Overview page (e.g. overview.html was overwritten or the regex matched more than intended), or
   - Broke all dashboard routes because the routing/fallback order was wrong, or
   - Caused `/dashboard/finance` to return a modified overview shell that failed to load (e.g. esm.sh/CORS/script errors), and the same pattern was assumed for the rest of the dashboard.

   **Result:** Entire dashboard became unusable.

---

## Why It Wasted Time and Broke Things

- **R2 as source of truth was ignored:** All dashboard HTML and JS lives in the agent-sam R2 bucket. The correct fix was to ensure R2 has the right HTML shells (e.g. `finance.html`, `billing.html`, `clients.html`) that load the existing JSX, and for the worker to **only** serve those files. No in-worker HTML rewriting.

- **Worker was used to “rebuild” HTML:** The worker should not fetch `overview.html` and rewrite it into another page. That is fragile (regex, encoding, script order), and one bug breaks every route that shares that code path.

- **No single source of shell:** Overview, finance, billing, clients should each have their own HTML file in R2. The worker’s job is to serve the requested key (`static/dashboard/${segment}.html`). No special cases that modify HTML in the worker.

- **Five consecutive deploys** with increasingly invasive logic instead of reverting after the first failure and fixing the content in R2.

---

## Correct Workflow Going Forward

1. **Dashboard routes:** Worker serves **only** `static/dashboard/${segment}.html` (and optional `dashboard/${segment}.html`) from R2. No in-worker HTML modification, no fetching overview to build other pages.

2. **New or rebuilt pages (e.g. Finance):** Add or update the **HTML file in R2** (e.g. `finance.html`) that contains the full shell and a script tag that loads the JSX (e.g. `/static/dashboard/Finance.jsx`). The worker already serves `.jsx` from R2 via static asset handling. Do **not** implement “rebuild” logic in the worker.

3. **After any failure:** Revert the worker to the last known-good version (serve R2 HTML only for dashboard), deploy immediately, then document and fix the actual content (R2) or process in a separate step.

4. **No regex replacement of HTML in the worker** for dashboard pages. No esm.sh or other runtime rewriting of dashboard shell in the worker.

---

## Revert Applied

- **Reverted to:** Dashboard block that only does:
  - `segment = pathLower.slice('/dashboard/'.length).split('/')[0] || 'overview'`
  - `key = static/dashboard/${segment}.html`, `altKey = dashboard/${segment}.html`
  - `obj = env.DASHBOARD.get(key) ?? env.DASHBOARD.get(altKey)`
  - If `obj`: return it as `text/html`. Else: `notFound(path)`.

- **Removed:** All logic that fetched `overview.html`, did string replaces, injected finance/billing/clients mount scripts, or used `jsx-shell.html` fallback.

- **Kept:** Static asset handling that serves `Finance.jsx`, `Billing.jsx`, `Clients.jsx` from R2 when requested (so existing HTML in R2 that references them still works).

---

## DB Documentation

- **Migration 115** (`migrations/115_deployment_notes_and_failure_record.sql`) adds `deployment_notes` to `cloudflare_deployments` and sets a failure note on the deploy that broke the dashboard (the row immediately before the revert deploy).
- **Run when credentials are available:**  
  `npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/115_deployment_notes_and_failure_record.sql`
- If the migration has already been applied (column exists), the UPDATE can be run separately to set the note on the bad deploy row.

---

## Accountability

- Five consecutive failures; dashboard fully broken once.
- Fix: revert worker to “serve R2 HTML only” and redeploy immediately. Future changes to dashboard content must be done in R2 (and optionally in repo for version control), not by rewriting HTML in the worker.
