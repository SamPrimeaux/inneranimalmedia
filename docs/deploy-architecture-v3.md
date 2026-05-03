# IAM platform — deployment architecture v3

**Repository:** `inneranimalmedia` (main worker: `inneranimalmedia`, dashboard SPA: R2 `inneranimalmedia` / `dashboard/app/`).  
**Last updated:** 2026-05-03 (canonical runbook; keep in sync with `scripts/upload-frontend-prod.sh` and `worker.js`).

This document is the **single runbook** for how the dashboard bundle, public pages, and the Worker are built, uploaded, and recorded. Agent Sam, CI, and humans should treat it as authoritative for deploy paths and D1 expectations.

---

## Monaco / Code editor (dashboard)

- **Package:** `@monaco-editor/react` (see `dashboard/package.json`).
- **Component:** `dashboard/components/MonacoEditorView.tsx`.
- **App wiring:** `dashboard/App.tsx` — `activeTab === 'code'`, `focusCodeEditorFromChat` opens the Code tab and workspace.
- **Default tab:** often `Workspace`; Code is a tab, not a separate origin route for the same shell.

---

## R2 — `inneranimalmedia` bucket (high level)

Bindings in production use this bucket for dashboard assets and static site content. Typical layout (verify with R2 listing when in doubt):

| Prefix / area | Role |
|---------------|------|
| `dashboard/app/` | Vite production build (JS/CSS, `index.html` / agent shell as built) |
| `pages/`, `auth/`, `src/components/`, `assets/` | Public marketing + auth HTML and shared partials (when using static pages path) |
| Other prefixes | CMS output, media, legacy `static/`, etc. (do not conflate with SPA path) |

**Do not** mix “upload whole worker dist to wrong prefix” with “public pages only” — see **Three deploy paths** below.

---

## Three deploy paths (do not mix)

### Path 1 — Dashboard SPA (Vite / React)

- **When:** React/TS changes under `dashboard/` (components, `App.tsx`, etc.).
- **Build:** `cd dashboard && npm run build` (this repo’s `package.json` script; do not assume `build:vite-only` exists here).
- **Upload:** `./scripts/upload-frontend-prod.sh`  
  - Builds, scans the bundle for obvious secret patterns, syncs `dashboard/dist` to R2 `inneranimalmedia` with prefix `dashboard/app/`, then **writes a D1 row** to `deployments` and related memory/plan updates (see script tail).
- **Config:** `wrangler.production.toml` for R2 and D1 execute.

### Path 2 — Public static pages (HTML + partials)

- **When:** Marketing/auth HTML, shared includes, or static assets that are **not** the Vite bundle.
- **Build:** Often none; upload scripts or wrangler `r2 object put` as documented in your current public-site pipeline.
- **Target:** R2 keys under `pages/`, `auth/`, `src/components/`, `assets/`, etc. — **not** `dashboard/app/`.

### Path 3 — Worker (main `inneranimalmedia` worker)

- **When:** `worker.js`, modules, bindings, routes, or anything that must run at the edge.
- **Deploy:** Push to `main` if Cloudflare Git integration runs `npx wrangler deploy`, **or** run the repo’s approved prod deploy command (see `CLAUDE.md` / `.cursorrules` — do not improvise root-level wrangler without `-c wrangler.production.toml`).
- **No** dashboard build is implied; frontend may already be on R2 from Path 1.

---

## D1 — tables touched by deploy type (summary)

| Table | SPA upload (`upload-frontend-prod.sh`) | Static pages | Worker deploy |
|-------|----------------------------------------|--------------|---------------|
| `deployments` | INSERT (script) | If scripted | Often via hooks `/ internal record` |
| `deployment_changes` | Optional / other pipelines | Varies | Varies |
| `agentsam_memory` | UPDATE `last_deploy_inneranimalmedia` (script) | — | May update |
| `agentsam_plan_tasks` | May mark sprint task done (script) | — | — |
| `email_logs` | — | — | Resend notifications (`notifySam`) |

Exact columns depend on applied migrations; the Worker’s `POST /api/deployments/log` handler uses the extended `deployments` column set (`worker_name`, `triggered_by`, etc.). The upload script aligns with that shape.

---

## Push notification email (`notifySam` / Resend)

- Callers must **not** leave literal `{repo}` or `{branch}` in subjects.  
- **`notifySam`** normalizes subjects and substitutes `{repo}` / `{branch}` using optional env hints (`GITHUB_REPO`, `GIT_BRANCH`) with defaults (`SamPrimeaux/inneranimalmedia`, `main`) so misconfigured templates still render.
- GitHub CI success follow-ups (`recordGithubCicdFollowups`) build explicit `repoName` / `branchName` before calling `notifySam`.
- **`email_logs.status`:** `sent` vs `failed` reflects Resend HTTP success; fix invalid `from` domain, recipient, or API key if failures persist.

---

## Instant validation (SQL snippets)

Run via Wrangler with prod config, e.g.:

`./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command "..."`

**After SPA upload:**

```sql
SELECT id, timestamp, git_hash, status, worker_name, triggered_by
FROM deployments
ORDER BY datetime(timestamp) DESC
LIMIT 5;
```

**Health snapshot (example):**

```sql
SELECT
  (SELECT COUNT(*) FROM deployments WHERE date(timestamp)=date('now')) AS deploys_today;
```

Adjust column names if your D1 schema differs (see migrations under `migrations/`).

---

## Cloudflare deploy hook (optional)

If configured, a POST to the worker (e.g. `/api/webhooks/cloudflare` with the correct signature header) can record worker deploys. Wire URLs and secrets only from dashboard/env — never commit secrets.

---

## Agent Sam boot / context (operational)

Skills, plan tasks, `project_memory`, and recent deploy rows may be loaded at chat start. Keeping **`deployments`** and **`agentsam_memory`** accurate makes operational answers trustworthy.

---

## Production endpoints (reference)

| Surface | URL |
|---------|-----|
| Production app + API | `https://inneranimalmedia.com` |
| Agent dashboard | `https://inneranimalmedia.com/dashboard/agent` |
| MCP (if used) | `https://mcp.inneranimalmedia.com/mcp` |

---

## Related docs (repo)

- `docs/DEPLOY_TRACKING.md` — `deployments` table and `POST /api/deployments/log`.
- `docs/CICD_TABLES_AND_MIGRATIONS.md` — CI/CD D1 tables.
- `migrations/145_deployments_tracking_tables.sql` — base `deployments` definition (extended by later migrations).

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-03 | v3 runbook added; documents Paths 1–3, R2/D1/Resend alignment, validation queries. |
