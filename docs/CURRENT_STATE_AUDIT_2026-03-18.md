# Current State Audit — Inner Animal Media Platform

**Date:** 2026-03-18  
**Purpose:** Snapshot of production architecture, recent progress, and next steps. No recommendations; state only.

---

## 1. Executive summary

- **Public site** (inneranimalmedia.com): Homepage, auth, and public pages (work, about, services, contact) use a **uniform header** (64px logo, nav links, Sign Up, mobile hamburger + glassmorphic sidenav). Public routes map clean URLs to R2 HTML via `PUBLIC_ROUTES` in the worker.
- **Dashboard**: Served from R2 bucket **agent-sam**; theme system is consolidated (user_settings + cms_themes); FOUC prevention in place; agent page uses Monaco diff flow with R2 save (disposal bug fixed).
- **Worker**: Single worker (`worker.js`) handles ASSETS, DASHBOARD, API, auth, agent chat, MCP, R2 APIs, D1, Vectorize, Resend. OAuth handlers (Google/GitHub) are locked; deploy only with explicit "deploy approved."
- **Progress**: Public header unification completed and uploaded to R2; Monaco Keep Changes stable; MCP tool approval path fixed; daily memory injection for Agent Sam context.

---

## 2. Public site (inneranimalmedia.com)

### 2.1 Routing

| URL | Source | R2 bucket | R2 key |
|-----|--------|-----------|--------|
| `/` | ASSETS | inneranimalmedia-assets | index-v3.html (fallback index-v2.html, index.html) |
| `/work` | ASSETS | inneranimalmedia-assets | process.html |
| `/about` | ASSETS | inneranimalmedia-assets | about.html |
| `/services` | ASSETS | inneranimalmedia-assets | pricing.html |
| `/contact` | ASSETS | inneranimalmedia-assets | contact.html |
| `/terms` | ASSETS | inneranimalmedia-assets | terms-of-service.html |
| `/privacy` | ASSETS | inneranimalmedia-assets | privacy-policy.html |
| `/learn` | ASSETS | inneranimalmedia-assets | learn.html |
| `/games` | ASSETS | inneranimalmedia-assets | games.html |
| `/auth/signin`, `/auth/login`, `/auth/signup` | DASHBOARD | agent-sam | static/auth-signin.html |

Clean URLs are implemented via `PUBLIC_ROUTES` in worker.js (lines 1006–1021). No auth gate on these pages; session is required only for dashboard and API where applicable.

### 2.2 Header and nav (current state)

- **Canonical header**: White glassmorphic bar, 64px logo, links (Home, Work, About, Services, Contact), "Sign Up" → `/auth/signup`, mobile hamburger (3 bars → X), overlay, sidenav ~50vw with same links + Sign Up (white in sidenav). Breakpoint 680px.
- **Applied to**: Homepage (`public-homepage/index-v3.html`), auth (`dashboard/auth-signin.html`), and public pages in `public-pages/` (process.html, about.html, pricing.html, contact.html). All four public pages were updated 2026-03-18 and **uploaded to R2** (inneranimalmedia-assets) with `--remote`.
- **Repo**: `public-homepage/index-v3.html`, `dashboard/auth-signin.html`, `public-pages/*.html`. Auth is served from agent-sam; public HTML from inneranimalmedia-assets.

### 2.3 Static assets

- Any other path (e.g. `/some/file.js`) is looked up as `path.slice(1)` in ASSETS, then DASHBOARD. No path rewriting.

---

## 3. Auth and dashboard

### 3.1 Auth

- Google and GitHub OAuth; callback handlers in worker.js are **locked** (no rewrites).
- Session cookie: `session=<id>`, HttpOnly, Secure, SameSite=Lax, Path=/, Domain=inneranimalmedia.com (or www).
- After login: redirect to `/dashboard/overview`. Sign-out clears cookie and redirects to `/auth/signin`.

### 3.2 Dashboard pages

- Served from R2 bucket **agent-sam** at keys `static/dashboard/<name>.html` (and some at `dashboard/<name>.html`).
- Shell, theme, and assets (agent-dashboard.js, agent-dashboard.css, etc.) from same bucket. Theme: single source of truth in cms_themes + user_settings; preload from localStorage to prevent FOUC.
- **Agent page** (`/dashboard/agent`): React app (FloatingPreviewPanel, Monaco diff, chat). Cache buster in agent.html (e.g. v47+). Keep Changes saves to R2; 300ms disposal delay; saveError shown on PUT failure. MCP tool approval: "Approve & Execute" uses skipApprovalCheck path (worker.js).

---

## 4. Worker and bindings

### 4.1 Worker

- **Entry:** `worker.js` (repo root). Deployed via `npm run deploy` (uses `./scripts/deploy-with-record.sh` and `wrangler.production.toml`). Never run `wrangler deploy` directly.
- **R2 backup:** agent-sam/source/worker-source.js (backup only; deploy uses repo worker.js).

### 4.2 R2 bindings

| Binding | Bucket | Purpose |
|---------|--------|---------|
| ASSETS | inneranimalmedia-assets | Public HTML (index, public pages), static assets |
| DASHBOARD | agent-sam | Auth page, dashboard HTML/JS/CSS, agent bundle, worker backup |
| R2 (or equivalent) | iam-platform | Memory, daily logs, schema docs (AutoRAG, etc.) |
| CAD_ASSETS | splineicons | CAD/icons |

### 4.3 Other bindings

- D1 (business DB), KV, Vectorize (e.g. inneranimalmedia-aisearch), AI (Workers AI / gateway), Resend (email), MYBROWSER (Playwright). MCP server: https://mcp.inneranimalmedia.com/mcp (Bearer token in .cursor/mcp.json).

---

## 5. Deploy and R2 upload

### 5.1 Rules

- **Deploy:** Only after Sam types "deploy approved." Use `npm run deploy` (not raw wrangler deploy). Credentials via `./scripts/with-cloudflare-env.sh` (loads .env.cloudflare or env).
- **Dashboard:** Any change under `dashboard/` that is served from R2 must be uploaded to agent-sam **before** deploy (see `.cursor/rules/dashboard-r2-before-deploy.mdc`).
- **Public pages (inneranimalmedia-assets):** After editing files in `public-pages/`, upload each to inneranimalmedia-assets with `--remote` (bucket/key = filename, e.g. process.html). No worker deploy needed for content-only updates.

### 5.2 Upload commands (reference)

```bash
# Single dashboard HTML (agent-sam)
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/<file>.html --file=dashboard/<file>.html --content-type=text/html --remote -c wrangler.production.toml

# Single public page (inneranimalmedia-assets)
./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia-assets/<file>.html --file=public-pages/<file>.html --content-type=text/html --remote -c wrangler.production.toml
```

---

## 6. Protected files and conventions

- **No rewrites:** worker.js (OAuth callbacks), agent.html, FloatingPreviewPanel.jsx (surgical edits only; state line numbers first). wrangler.production.toml: do not change bindings.
- **Before any file change:** State file, line numbers, current vs new code; wait for approval when required.
- **Code:** No emojis in code/UI; no hex in JSX/CSS (use CSS vars). Session log: append to `docs/cursor-session-log.md` after each task.

---

## 7. Recent progress (mid-March 2026)

- **Uniform public header:** All of /work, /about, /services, /contact use same header as homepage; R2 upload completed 2026-03-18.
- **Monaco diff flow:** Keep Changes saves to R2; disposal race fixed (manual setValue removed); saveError on failure; 300ms delay. Phase 2 ~95% complete; optional auto-close panel remaining.
- **MCP tool approval:** Execute-approved-tool path skips requires_approval when frontend sends approval (skipApprovalCheck).
- **Theme:** Single source of truth (cms_themes + user_settings); theme preload across dashboard and agent; no FOUC.
- **Agent context:** Chat handler injects R2 memory/daily (today + yesterday) into compiled context for "what did we do today" answers.
- **Deploy script:** Stale R2 uploads removed from deploy-with-record.sh for missing assets.

---

## 8. Known gaps / next steps (from docs and session log)

- **Phase 2 (Monaco):** Optional auto-close of diff panel after successful save (15–30 min).
- **Phase 4 (Tool Execution Feedback):** SSE events for tool_start/tool_result; UI indicators in chat (estimated 3–4 hours).
- **Public routes:** terms, privacy, learn, games are in PUBLIC_ROUTES; R2 keys (terms-of-service.html, privacy-policy.html, learn.html, games.html) may or may not exist in inneranimalmedia-assets; 404 until objects are uploaded.
- **Session log:** Update 2026-03-18 entry to reflect R2 upload completed (all four public pages).

---

## 9. Key docs

| Doc | Purpose |
|-----|---------|
| `docs/cursor-session-log.md` | Per-session changes, deploy status, what is live |
| `docs/LOCATIONS_AND_DEPLOY_AUDIT.md` | Worker source, R2 keys, deploy commands |
| `docs/AUDIT-PUBLIC-ROUTING-R2-AUTH.md` | Public routing (pre–PUBLIC_ROUTES; routing now updated in worker) |
| `docs/AGENT_SAM_ROADMAP.md` | Phase 2/4 status, next steps |
| `.cursor/rules/*.mdc` | Hard rules: deploy, file protection, R2 before deploy, D1, MCP |

---

**Audit complete.** Use this as the single "current state" reference; update when making material architectural or go-live changes.
