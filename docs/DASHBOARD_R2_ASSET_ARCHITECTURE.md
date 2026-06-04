# Dashboard R2 asset architecture

This document records how the Inner Animal Media **dashboard SPA** is built, which **R2 keys** the production Worker resolves, and how we are migrating away from the misleading `/static/dashboard/agent/` prefix **without** deleting legacy objects or breaking live traffic.

## Phase 1 — Audit (baseline)

### 1. `dashboard/vite.config.ts` (updated)

| Item | Value / notes |
|------|----------------|
| **base (legacy)** | `/static/dashboard/agent/` — named for Agent Sam but served **all** dashboard routes. |
| **base (current)** | `/static/dashboard/app/` — canonical public path for compiled assets. |
| **shell.css caveat** | Vite would incorrectly rewrite `/static/dashboard/shell.css` to sit under `base`; `vite.config.ts` plugin `restore-dashboard-shell-css-href` fixes the built `index.html` so the shell stays at site path `/static/dashboard/shell.css` (R2 key `static/dashboard/shell.css`). |
| **entryFileNames** | `agent-dashboard.js` (name is historical; file is the full dashboard SPA entry). |
| **chunkFileNames** | `[name].js` |
| **assetFileNames** | `agent-dashboard.css` for CSS; other assets use `[name][extname]`. |
| **manualChunks** | `vendor-react`, `vendor-editor`, `vendor-mermaid`, `vendor-three`, `vendor-cytoscape`, `vendor-katex`, `agent-core`, `settings`, `learn`, `studio` — **route-oriented splits** already exist alongside vendors. |
| **Route-only Vite entries** | None — single SPA; route modularity is via **lazy React imports** + Rollup `manualChunks`. |

Renaming `base` is safe **only** with Worker fallbacks (below) and uploading new keys; browsers with cached HTML pointing at `/static/dashboard/agent/*` still resolve via Worker alias logic until caches expire or a mirror upload is used.

### 2. `scripts/deploy-frontend.sh`

- **Bucket:** `inneranimalmedia`
- **Prefix:** **`static/dashboard/app`** (rclone sync from `dashboard/dist`) — matches Vite `base` in `dashboard/vite.config.ts`
- **Purpose:** Production-oriented full pipeline (build, R2 sync, manifest/reconcile). Legacy `/static/dashboard/agent/*` URLs still resolve via Worker aliases in `dashboard-r2-assets.js`.

### 3. `scripts/upload-agent-dashboard-r2.sh`

- **Bucket:** `inneranimalmedia-sandbox-cicd` (not production)
- **Config:** `wrangler.jsonc`
- **Prefix:** `static/dashboard/agent`
- **Status:** Marked **legacy/sandbox** in script header. **Do not use for production** `inneranimalmedia` uploads.

### 4. `scripts/upload-frontend-prod.sh`

- **Bucket:** `inneranimalmedia`
- **Prefix:** `dashboard/app` (flat mirror of dist paths under `dashboard/app/<file>`)
- **Config:** `wrangler.production.toml`
- **Note:** Complements `static/dashboard/*` keys; Worker historically maps `static/dashboard/agent/*` → `dashboard/app/*`.

### 5. Worker entry — `src/index.js` (not `src/worker/index.js`)

**Static requests:** URL path without leading slash becomes `assetKey` (e.g. `static/dashboard/app/learn.js`).

Resolution is delegated to `src/core/dashboard-r2-assets.js`:

1. Exact key.
2. If key is under `static/dashboard/agent/`, also try `static/dashboard/app/<rest>` and `dashboard/app/<rest>`.
3. If key is under `static/dashboard/app/`, also try `static/dashboard/agent/<rest>` and `dashboard/app/<rest>`.
4. Legacy: `static/<assetKey>` and `static/dashboard/agent/<assetKey>`.

**SPA HTML** for `/dashboard/*` and `/onboarding` (after auth gate): `getDashboardSpaHtmlShell()` tries in order:

1. `static/dashboard/app.html`
2. `static/dashboard/app/index.html`
3. `static/dashboard/agent.html`
4. `dashboard/app/agent.html`
5. `index.html`

### 6. R2 production — what is “live” (conceptual)

Exact inventory requires `wrangler r2 object list` / internal tooling. From code and deploy scripts, **expect**:

| Prefix / key pattern | Role |
|---------------------|------|
| `static/dashboard/agent/**` | Legacy Vite output + chunks (still populated by older deploys; Worker still serves). |
| `static/dashboard/agent.html` | Legacy HTML shell. |
| `static/dashboard/app/**` | **Target** Vite output after new uploads. |
| `static/dashboard/app.html`, `static/dashboard/app/index.html` | **Target** HTML shells. |
| `dashboard/app/**` | Alternate mirror used by `upload-frontend-prod.sh` and Worker fallbacks. |
| `dashboard/app/agent.html` | Older shell name. |
| `static/dashboard/shell.css` | Global shell CSS linked from HTML. |
| `learn/<course-slug>/...` | **Course resources** (exports, docs, downloads) — **not** dashboard JS. |

**Separation:**

- `static/dashboard/app/*` = **compiled dashboard application** (JS/CSS/chunks).
- `learn/*` = **course files** referenced from D1 `course_exports` (and future `cms_assets` bridge); Learn UI uses **`/api/learn/*`**, not public R2 URLs for structure.

---

## Phase 2 — Backward-compatible target (implemented)

- **Vite `base`:** `/static/dashboard/app/`
- **Upload prefix (canonical):** `static/dashboard/app/`
- **Shell keys:** `static/dashboard/app.html` + `static/dashboard/app/index.html`
- **Legacy keys** (`static/dashboard/agent/*`, `static/dashboard/agent.html`, `dashboard/app/*`, `dashboard/app/agent.html`) are **not** deleted; Worker keeps resolving them.

---

## Phase 3 — Upload scripts

| Script | Use |
|--------|-----|
| **`scripts/upload-dashboard-app-r2-prod.sh`** | **Production** upload: `inneranimalmedia`, `wrangler.production.toml`, `static/dashboard/app/`, shells, optional `shell.css`. Optional `UPLOAD_DASHBOARD_MIRROR_LEGACY_AGENT=1` duplicates to `static/dashboard/agent/`. |
| `scripts/upload-agent-dashboard-r2.sh` | Sandbox/legacy only. |
| `scripts/deploy-frontend.sh` | Full pipeline; still syncs to `static/dashboard/agent` until updated. |
| `scripts/upload-frontend-prod.sh` | Still uploads to `dashboard/app/` layout. |

---

## Phase 4 — Worker compatibility

Implemented in `src/core/dashboard-r2-assets.js` and wired from `src/index.js`. **No** change to dashboard **UI** or **shell** layout.

---

## Phase 5 — Route-level code splitting

- **One SPA**, no per-route Vite apps.
- **React `lazy` + `Suspense`** for heavy dashboard routes (`/dashboard/overview`, `learn`, `settings`, etc.); `/dashboard/agent` IDE stack stays on the main chunk set loaded with the shell.

---

## Phase 6 — Learn course R2 storage

- Files: `learn/<course-slug>/...` in bucket `inneranimalmedia` (or as recorded in `course_exports`).
- D1: `course_*` for structure; `course_exports.r2_bucket` / `r2_key` for file pointers.
- Dashboard Learn module must **not** hardcode `learn/...` paths; consume **`/api/learn/dashboard`**.

---

## Phase 7 — CMS alignment

| Layer | Responsibility |
|-------|----------------|
| `course_*` | Courses, modules, lessons, assignments, progress, submissions, grades, exports. |
| `cms_themes` | Dashboard tokens / theme (existing `applyCmsTheme` pipeline). |
| `cms_assets` | Future canonical asset metadata; bridge from `course_exports`. |
| `cms_component_templates` / `cms_pages` | Future landing / reusable blocks; **not** required for `/dashboard/learn` rendering today. |
| `cms_activity_log` | Future Learn analytics events. |

---

## Phase 8 — Deployment rules

| Change type | Requires |
|-------------|----------|
| Dashboard **base** / chunk paths | `npm run build:vite-only` + **R2 upload** (`upload-dashboard-app-r2-prod.sh` or pipeline). |
| Worker **resolution** / new R2 helpers | **`wrangler deploy`** (production toml as you use today). |
| Course **content** / exports | D1 + R2 under `learn/` only (no dashboard deploy once authoring APIs exist). |
| **Do not** delete legacy `static/dashboard/agent/**` until traffic and caches are verified stable. |

---

## Commands (reference)

```bash
# Build
npm run build:vite-only

# Production R2 upload (canonical app prefix)
./scripts/upload-dashboard-app-r2-prod.sh

# Optional: duplicate to legacy prefix for aggressive cache compatibility
UPLOAD_DASHBOARD_MIRROR_LEGACY_AGENT=1 ./scripts/upload-dashboard-app-r2-prod.sh

# Worker (after changing src/index.js or dashboard-r2-assets.js)
npm run deploy
# or: ./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml
```

---

## Future (optional)

- Per-route **manifest** prefixes under `static/dashboard/routes/<name>/` for operational clarity only if we introduce a build plugin; not required for SPA health.
- Point `deploy-frontend.sh` / `r2:deploy-manifest` default prefix at `static/dashboard/app` once the team standardizes on one pipeline.
