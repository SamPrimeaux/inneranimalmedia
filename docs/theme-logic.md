# Dashboard theme logic

This document describes how dashboard themes are applied so the shell (topbar, sidebar) and page content respect the theme selected in User Settings.

## Overview

- **Storage**: Selected theme slug is stored in **localStorage** (`dashboard-theme`) and persisted per user via **GET/PATCH `/api/settings/theme`** (D1 `user_settings` or equivalent).
- **Application**: The `<html>` element gets `data-theme="<slug>"`. All shell and content CSS use CSS variables (e.g. `--bg-nav`, `--text-nav`, `--bg-canvas`) that are defined per `[data-theme="..."]` block.

## Required pieces on every dashboard page

### 1. Early inline script (before first paint)

Runs in `<head>` before any external CSS so the shell never flashes the wrong theme:

```html
<script>
(function() {
    try {
        var t = localStorage.getItem('dashboard-theme');
        if (t) document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
})();
</script>
```

### 2. Optional: API-driven shell theme (for cms_themes slugs)

For pages that may use theme slugs from the API (e.g. from `cms_themes`) that are not in the static CSS, add a second script that fetches the saved theme and injects shell variables:

- `GET /api/settings/theme` → `{ theme: "<slug>" }`
- `GET /api/themes` → `{ themes: [ { slug, name, config } ] }`
- Find the theme by slug; build `[data-theme="<slug>"] { --bg-nav: ...; --text-nav: ...; ... }` from `config` (nav, bg, text, border, primary). If `config` is empty, use fallbacks (e.g. `--bg-nav:#1e293b`, `--text-nav:#f1f5f9`).
- Inject a `<style id="shell-theme-preload">` (or similar) and set `document.documentElement.setAttribute('data-theme', slug)` and `localStorage.setItem('dashboard-theme', slug)`. Persist the variables object to `localStorage.setItem('dashboard-theme-vars', JSON.stringify(variables))` so the sync script can apply them before paint.

This is implemented in `dashboard/agent.html` as the second inline script.

### 3. CSS variables

Every dashboard page must define (or link) theme variables so the shell and content render correctly:

- **:root** — Fallback values (e.g. dark ocean) so that before any theme is applied, something sensible shows.
- **[data-theme="meaux-glass-blue"]** — Light canvas, blue nav, etc.
- **[data-theme="inneranimal-slate"]** — Dark slate nav and canvas.
- **[data-theme="meaux-mono"]** — Light canvas, dark nav.

Key shell variables:

| Variable       | Purpose |
|----------------|--------|
| `--bg-nav`     | Topbar and sidebar background |
| `--text-nav`   | Nav text color |
| `--text-nav-muted` | Nav secondary text |
| `--border-nav` | Nav borders |
| `--bg-canvas`  | Main content background |
| `--bg-elevated`| Cards, panels |
| `--text-primary`, `--text-secondary` | Content text |
| `--accent`, `--color-primary` | Buttons, links |

Shared assets:

- **/static/dashboard/shell.css** — Uses `var(--bg-nav)` etc.; no hardcoded colors.
- **styles_themes.css** (or inline blocks) — Defines the `[data-theme="..."]` blocks.

### 4. React / app-level sync (when applicable)

In the Agent dashboard (and any React app that has a theme picker):

- On load: fetch `GET /api/settings/theme`, set `data-theme` and localStorage.
- When building dynamic theme CSS from `/api/themes`, **always** emit shell variables for every theme:
  - Prefer `config.nav` → `--bg-nav`; else `config.bg` or `config.surface`.
  - Prefer `config.text` → `--text-nav`; else `config.textSecondary`.
  - For themes with empty config, inject a default block (e.g. slate) so the shell is never unstyled.
- On visibility change (tab focus), re-fetch `/api/settings/theme` and re-apply so returning from User Settings reflects the new theme.

## Pages that must have theme logic

All dashboard HTML pages should include (1) and (3). Pages that are the main “shell” (topbar + sidebar in the same document) should also include (2) if they support API-driven theme slugs:

- **agent** — Has (1), (2), (3).
- **overview, finance, time-tracking, cloud, chats, mcp** — In repo; ensure (1) + full (3). Add (2) if you want API slugs to work without a full page reload.
- **billing, clients, tools, calendar, images, draw, meet, kanban, cms, mail, pipelines, onboarding, user-settings** — Served from R2 (`static/dashboard/<segment>.html`). If they exist only in R2, pull each, add (1) and (3) (and optionally (2)), then re-upload.

## Billing / Clients / other data-driven pages

- **Billing**: Metrics (e.g. “Paid This Month”, “Variable / Usage”) should come from **D1** (e.g. `spend_ledger`, subscriptions). Ensure the page’s script or React app calls `GET /api/billing/summary` (or equivalent) and renders values instead of “—”.
- **Clients**: List and CRUD should use `GET /api/clients` and `POST /api/clients`; ensure the page is wired to those and theme uses (1)+(3) (and (2) if desired).

## Cloudflare Images (dashboard/images)

For full CRUD on Cloudflare Images, the worker typically needs:

- **Account ID** and **API Token** (or **Images API token**) with permissions: **Cloudflare Images: Edit** (or Account Settings → API Tokens → Create Token → Cloudflare Images Edit).
- **Account-level** or **Custom Subdomain** (e.g. `imagedelivery.net` or your custom subdomain) for delivery.
- Env vars often used: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_IMAGES_API_TOKEN` (or `CF_IMAGES_ACCOUNT_ID`, `CF_IMAGES_API_TOKEN`). The Images API is REST: list images, upload, get details, delete. Ensure the worker has an API route that uses these to list/upload/delete and the dashboard/images page calls those routes and applies theme (1)+(3).

---

*Last updated: 2026-03-09. Reflects agent.html and AgentDashboard.jsx theme implementation.*
