# Agent Sam / Terminal: Theme repair commands for R2-only dashboard pages

Use these to add **full theme logic** (early script + API theme script + shell) to dashboard pages that exist only in R2 or need repair. After running, verify at `https://inneranimalmedia.com/dashboard/<segment>`.

## Prerequisites

- From **repo root**: `./scripts/with-cloudflare-env.sh` must be used so `CLOUDFLARE_API_TOKEN` is set.
- Config: `-c wrangler.production.toml`

---

## 1. Billing (already done)

- **Repo:** `dashboard/billing.html` (created from overview; has theme + `/api/billing/summary`).
- **R2:** `agent-sam/static/dashboard/billing.html` (uploaded).
- **Verify:** Open https://inneranimalmedia.com/dashboard/billing — theme and “Paid This Month” (from DB) should show.

---

## 2. Commands to repair other R2-only pages

For each segment below, **if the page is missing in R2** (404), create it from the billing template then upload. If the page exists in R2, pull → inject theme block → push.

### Option A: Create from repo template (recommended)

Use `dashboard/billing.html` as the theme/shell template. For each segment:

1. **Copy billing to the new segment** (from repo root):

```bash
# Replace SEGMENT with: clients, tools, calendar, images, draw, meet, kanban, cms, mail, pipelines, onboarding
SEGMENT="clients"
cp dashboard/billing.html "dashboard/${SEGMENT}.html"
```

2. **Edit the new file** (title, nav active, main content):
   - Set `<title>` to e.g. `Clients — Inner Animal Media`.
   - In the sidenav, set the link for `/dashboard/SEGMENT` to `class="nav-item active"` and clear `active` from the Billing link (set Billing to `class="nav-item "`).
   - Replace the `<main>` content with segment-specific content (e.g. Clients: “Client MRR and revenue pipeline”, placeholder list; Tools: “Dev Tools”, etc.). Keep the same shell (topbar, sidenav).
   - Remove or replace the billing fetch script with segment-specific logic (e.g. clients: fetch `/api/clients`).

3. **Upload to R2**:

```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 object put "agent-sam/static/dashboard/${SEGMENT}.html" \
  --file="dashboard/${SEGMENT}.html" \
  --content-type=text/html \
  --remote -c wrangler.production.toml
```

4. **Add to deploy script** (optional): In `agent-dashboard/deploy-to-r2.sh`, add a block for `dashboard/${SEGMENT}.html` like the one for `billing.html`.

### Option B: Pull from R2, inject theme, push back

If the page **already exists** in R2:

```bash
# 1. Pull
./scripts/with-cloudflare-env.sh npx wrangler r2 object get "agent-sam/static/dashboard/SEGMENT.html" \
  --remote --file="/tmp/SEGMENT.html" -c wrangler.production.toml

# 2. Edit /tmp/SEGMENT.html:
#    - In <head>, right after the first <script> that reads localStorage 'dashboard-theme' and 'dashboard-theme-vars', insert the second script block from dashboard/billing.html (the one that fetches /api/settings/theme and /api/themes and calls applyShellTheme). Use id="shell-theme-preload" for the injected style, and persist variables to localStorage 'dashboard-theme-vars'.
#    - Ensure :root and [data-theme="meaux-glass-blue"], [data-theme="inneranimal-slate"], [data-theme="meaux-mono"] exist (or link to shell.css + theme CSS).

# 3. Push
./scripts/with-cloudflare-env.sh npx wrangler r2 object put "agent-sam/static/dashboard/SEGMENT.html" \
  --file="/tmp/SEGMENT.html" \
  --content-type=text/html \
  --remote -c wrangler.production.toml
```

---

## 3. One-liner list for Agent Sam

Segments to process (create or repair): **clients**, **tools**, **calendar**, **images**, **draw**, **meet**, **kanban**, **cms**, **mail**, **pipelines**, **onboarding**.

For each, either:
- Create from `dashboard/billing.html` (change title, nav active, main content, and optional API script), then upload to `agent-sam/static/dashboard/<segment>.html`, or  
- Pull from R2, insert the API theme script (same as in `dashboard/billing.html` head) and ensure theme CSS vars exist, then push back.

---

## 4. Theme block to inject (reference)

The **second script** in `<head>` (from `dashboard/billing.html` or `dashboard/agent.html`) should:

1. Define `applyShellTheme(slug, config, apiVariables)` that sets `data-theme`, localStorage `dashboard-theme` and `dashboard-theme-vars`, and injects/updates a `<style id="shell-theme-preload">` with `[data-theme="slug"]{ --bg-nav:...; --text-nav:...; ... }` from apiVariables or config (or fallbacks).
2. Fetch `GET /api/settings/theme` → then `GET /api/themes` → find theme by slug → call `applyShellTheme(slug, config)`.

Full block is in `dashboard/billing.html` lines ~15–64 (the script immediately after the first localStorage script).

---

*Created 2026-03-09. Billing page created and uploaded; other segments can be added using the same pattern.*
