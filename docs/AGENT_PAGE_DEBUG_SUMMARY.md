# Agent page debug summary (for next agent)

**Date:** 2026-03-02  
**Live URL:** https://inneranimalmedia.com/dashboard/agent  
**Symptom:** Shell (topbar + sidenav) renders; main content area is **blank/white**. No Monaco, iframe, or footer chat panel. No console errors. User has tried hard refresh; issue persists.

---

## Root cause (blank main — fixed by R2 upload)

The live site is serving an **old minimal** agent page from R2, not the full repo page. A direct fetch of `https://inneranimalmedia.com/dashboard/agent` returns a short HTML (model picker, "Hi. I'm agent_sam", Send, "## Dashboard") instead of the full `dashboard/agent.html` (~149KB) with `.agent-sam-root`, Monaco container, footer chat, and workspace. So the shell (topbar + sidenav) can look correct while the **main content is the wrong document** — hence blank. Fix: upload the repo's full `dashboard/agent.html` and `dashboard/pages/agent.html` to the **agent-sam** R2 bucket at the keys below. If `wrangler r2 object put` returns 400, use **Cloudflare Dashboard → R2 → agent-sam → Upload** (see Deploy steps).

---

## What was built (don’t lose this)

## Run the debug script first

```bash
node scripts/debug-agent-page.mjs
# Or with a different origin:
node scripts/debug-agent-page.mjs https://inneranimalmedia.com
```

The script fetches the live agent page and fragment (with cache-bust), checks for markers (workstation not collapsed, root min-height, footer chat, single overlay, no debug strip), and prints PASS/FAIL. Use it to see if the live site is serving the latest R2 upload or stale content.

---

### 1. Agent page features (in code and R2)

- **Unified sitenav** — Same topbar + left sidebar as rest of dashboard (Overview, Finance, Agent, etc.).
- **Footer chat pane** — Fixed bar at bottom with:
  - **Context gauge:** `Context 0k / 128k` (estimated tokens from conversation).
  - **$ gauge:** AI spend this month from `GET /api/finance/ai-spend?scope=agent` (polls every 60s).
  - Expand/collapse “Chat”; scrollable messages + Send input.
- **Main workspace** — Editor / Diff / Preview / Logs tabs, “Create New File”, “Load Files”, preview iframe (Agent Development Tools).
- **Layout safeguard** — `main.main-content.agent-page-main` has `min-height: 60vh` so the main area doesn’t collapse to zero.

### 2. Worker (`worker.js`)

- **Dashboard routing**
  - `/dashboard` → redirect to `/dashboard/overview`.
  - `/dashboard/pages/<name>.html` → serve R2 key `static/dashboard/pages/<name>.html` (for shell-injected fragments). **Added** so `/dashboard/pages/agent.html` returns the agent fragment.
  - `/dashboard/<segment>` → serve `static/dashboard/<segment>.html` or `dashboard/<segment>.html` (e.g. `/dashboard/agent` → `static/dashboard/agent.html`).
- **Cache busting** — Dashboard HTML responses use `Cache-Control: no-cache, no-store, must-revalidate` and `Pragma: no-cache` so browsers don’t serve stale cached HTML.
- **Finance API** — `GET /api/finance/ai-spend?scope=agent` returns `summary.total_this_month`, `rows[]`, and supports the agent budget pie and usage table.

### 3. R2 (bucket: **agent-sam**, DASHBOARD binding)

| R2 key | Purpose |
|--------|--------|
| `static/dashboard/agent.html` | **Full** agent page (shell + main + footer chat). Served when user hits `/dashboard/agent` and worker returns this as the document. |
| `dashboard/agent.html` | Fallback key for same full page. |
| `static/dashboard/pages/agent.html` | **Fragment** for shell injection: `<main>...</main>` + footer chat div + script. Used when the shell fetches content into `#page-content`. |

### 4. Repo files

- **`dashboard/agent.html`** — Full agent page (source for R2 full page). Contains inline styles, shell (topbar, sidenav), main (agent-sam-root, workspace, footer chat), and scripts.
- **`dashboard/pages/agent.html`** — Fragment only (lines extracted from full page: main + footer chat + footer script). Source for R2 `static/dashboard/pages/agent.html`.
- **`worker.js`** — Routing and cache headers as above.
- **`migrations/109_agent_footer_ai_spend.sql`** — Optional D1 deploy record for this work.
- **`docs/DASHBOARD_METRICS_AND_TIME_TRACKING.md`** — Documents agent page load and R2 keys.

---

## Architecture to clarify

- **Direct load:** Request to `https://inneranimalmedia.com/dashboard/agent` → worker serves `static/dashboard/agent.html` (full document). That document includes its own topbar, sidenav, and main content. So a **full page load** of `/dashboard/agent` should show the full agent UI.
- **Shell-injected load:** If the app uses a **single shell** for all dashboard routes, when path is `/dashboard/agent` the shell fetches the agent **fragment** and injects it into `#page-content`. That fragment is the R2 object **`static/dashboard/pages/agent.html`** (the ~87 kB file; also available at the bucket’s public URL e.g. `pub-xxx.r2.dev/static/dashboard/pages/agent.html`).
- **Critical:** The shell must fetch the fragment from **same origin** (your domain), not from the R2 public URL. If the shell fetches from `https://pub-xxx.r2.dev/static/dashboard/pages/agent.html`, the browser will block it (**CORS**), and the main area stays blank (often with no clear console error). Use one of these same-origin URLs instead (the worker serves the same R2 object):
  - `https://inneranimalmedia.com/dashboard/pages/agent.html`
  - `https://inneranimalmedia.com/static/dashboard/pages/agent.html`
- The worker serves both paths from R2 key `static/dashboard/pages/agent.html`.

**Current mystery:** User sees **shell + blank main**. That can mean:

1. **Same document for all dashboard routes** — The HTML for `/dashboard/agent` is actually the **overview** (or a generic shell), and the script loads “agent” content via fetch. If the fetch URL is wrong or the inject target is wrong, the main stays blank.
2. **Full agent document but main not visible** — The response for `/dashboard/agent` is the full `agent.html`, but something (CSS, JS, or structure) hides or collapses the main content. No console errors were reported.
3. **Caching** — An old HTML or asset is cached. Cache-control headers were added for dashboard HTML to reduce this; user should try again after deploy.

---

## Verification commands

```bash
# Full agent page (should include agent-sam-root, footer chat; if missing, R2 has wrong file)
curl -sS 'https://inneranimalmedia.com/dashboard/agent' | grep -o 'agent-sam-root\|agent-footer-chat\|agentSamMonacoContainer' | head -5

# Fragment (for shell injection)
curl -sS -w '%{http_code}' -o /dev/null 'https://inneranimalmedia.com/dashboard/pages/agent.html'
# Expect 200

# Cache headers on dashboard HTML (after worker deploy)
curl -sS -D - -o /dev/null 'https://inneranimalmedia.com/dashboard/agent' | grep -i cache-control
# Expect no-cache / no-store
```

---

## Credentials and R2 uploads (no secrets in repo)

Wrangler needs `CLOUDFLARE_API_TOKEN` (and optionally `CLOUDFLARE_ACCOUNT_ID`) for deploy and R2 uploads. To **avoid putting them in the repo or in chat**:

**Option A — Sync from ~/.zshrc (one command, no typing secrets):**  
If your keys are already in `~/.zshrc`, run once from repo root:
```bash
source ~/.zshrc && ./scripts/sync-cloudflare-env-from-zshrc.sh
```
This writes `.env.cloudflare` from your current env without printing secrets. `.env.cloudflare` is gitignored.

**Option B — Manual:**  
`cp .env.cloudflare.example .env.cloudflare` and edit with your values.

**All wrangler/R2 commands (you or any agent):** Run via the wrapper so credentials are loaded from `.env.cloudflare` or, if missing, from `~/.zshrc`:
```bash
./scripts/with-cloudflare-env.sh npx wrangler deploy --config wrangler.production.toml
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent.html --file=./dashboard/agent.html --content-type=text/html --remote -c wrangler.production.toml
# etc.
```
**Never paste API tokens or account IDs in chat.** Agents use the wrapper only; keys stay in CF Dashboard / wrangler secrets / `.env.cloudflare` / `~/.zshrc`.

---

## Deploy steps (so next agent can re-deploy if needed)

1. **Worker**  
   `./scripts/with-cloudflare-env.sh npx wrangler deploy --config wrangler.production.toml`  
   (or `npx wrangler deploy ...` if env is already loaded; the wrapper ensures credentials from `.env.cloudflare`.)

2. **R2** (source of truth for dashboard UI)  
   Use the credential-safe wrapper so `CLOUDFLARE_API_TOKEN` is loaded from `.env.cloudflare` (see "Credentials and R2 uploads" above):
   ```bash
   ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent.html --file=./dashboard/agent.html --content-type=text/html --remote -c wrangler.production.toml
   ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/pages/agent.html --file=./dashboard/pages/agent.html --content-type=text/html --remote -c wrangler.production.toml
   ```
   If wrangler returns 400, upload via **Cloudflare Dashboard → R2 → agent-sam** (keys `static/dashboard/agent.html` and `static/dashboard/pages/agent.html`).

---

## Suggested next steps for debugging

1. **Duplicate overlay (fixed in repo)**  
   The full agent page had **two** `<div class="overlay" id="overlay"></div>` elements (invalid duplicate ID). One was removed. If an old cached version still had both, or if a script ever toggled the overlay, it could theoretically cover content. After pulling the fix and re-uploading, confirm only one overlay exists in view-source.

2. **Debug strip**  
   A bright green strip was added at the top of `<main>`: *"Agent workspace loaded — if you see this, main content is visible."*  
   - **If you see the strip:** The main content area is rendering; the issue is likely inside `.agent-sam-root` (flex/layout, or a child covering the rest). Inspect that container and its children in DevTools.  
   - **If you don’t see the strip:** The main is not visible (zero size, hidden, or covered). In DevTools → Elements, find `<main class="main-content agent-page-main">` and check its computed styles (e.g. `display`, `height`, `visibility`, `opacity`) and whether anything (e.g. overlay, another div) is on top of it.

3. **Confirm which document is loaded**  
   In DevTools → Network: when opening `/dashboard/agent`, check the **first** document request (the one that gets HTML). Note:
   - Request URL (is it exactly `/dashboard/agent` or something else?).
   - Response: does the HTML contain `agent-sam-root` and “Welcome to Agent Development” (full page) or is it the overview/shell with a different main?

4. **If the document is the full agent page**  
   Inspect the main content area in the Elements panel: is `<main class="main-content agent-page-main">` present and does it have the expected children (e.g. `.agent-sam-root`)? Check computed styles for `main` (e.g. `display`, `height`, `visibility`) to see if it’s hidden or zero height.

5. **If the document is the shell (overview)**  
   Find where the shell fetches “agent” content (e.g. search for `fetch(`, `pages/`, `agent` in the shell’s script). Confirm the URL (e.g. `/dashboard/pages/agent.html` or `/static/dashboard/pages/agent.html`) and that the response is the fragment. Then check where it’s injected (e.g. `#page-content` or similar) and that the container exists and is visible.

6. **Console and errors**  
   Even with “no console errors”, check for:
   - Failed network requests (e.g. 404 for the fragment or an asset).
   - Script errors in iframes or late-loaded scripts.
   - CORS or mixed-content issues if any asset is cross-origin.

7. **Test in incognito**  
   Open `/dashboard/agent` in an incognito/private window (and after worker deploy with cache-control) to rule out cache and extensions.

---

## Reference: key file locations

- Worker routing (dashboard + cache): `worker.js` (dashboard route block and `respondWithR2Object`).
- Full agent page: `dashboard/agent.html`.
- Agent fragment: `dashboard/pages/agent.html`.
- API used by agent ($ gauge): `GET /api/finance/ai-spend?scope=agent` (implemented in `worker.js`; returns `summary.total_this_month`, `rows`).
