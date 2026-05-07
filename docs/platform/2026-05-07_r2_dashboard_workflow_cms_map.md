# R2, dashboard, workflow, and CMS map (2026-05-07)

Bridge doc between brainstorming and execution: **what exists today**, **canonical targets**, **incremental verification**, and a **file-tree direction** that avoids big-bang rewrites.

---

## 1. R2 public asset model

### Dashboard bundle (`DASHBOARD` binding — production bucket commonly referenced as `inneranimalmedia` / “agent-sam” in docs)

- **Canonical prefixes:** `static/dashboard/app/**` (target Vite base), legacy alias `static/dashboard/agent/**`, mirror `dashboard/app/**`.
- **HTML SPA shells** tried in order by `getDashboardSpaHtmlShell()` (`src/core/dashboard-r2-assets.js`):

  | Order | Key |
  |-------|-----|
  | 1 | `static/dashboard/app.html` |
  | 2 | `static/dashboard/app/index.html` |
  | 3 | `static/dashboard/agent.html` |
  | 4 | `dashboard/app/agent.html` |
  | 5 | `index.html` |

- **Asset resolution:** `getDashboardR2Object()` cross-tries agent/app/dashboard-app paths so old bookmarks and caches keep working during migration.

### Broader site assets (`ASSETS` binding)

- Marketing HTML and static paths (e.g. `/`, keys under `src/components`, etc.) resolve via `env.ASSETS` before dashboard fallbacks (`src/index.js`).

### Reports, captures, screenshots

- **Protected prefixes** (inventory scripts): `captures/`, `reports/`, `snapshots/`, `manifests/`, `docs/`, etc. (`scripts/lib/r2-inventory-core.mjs` — `PROTECTED_PREFIXES`).
- **Screenshot conventions:** `reports/screenshots/before-YYYY-MM-DD/`, `reports/screenshots/after-…`, Playwright outputs (`screenshots/`, DOCS_BUCKET `screenshots/agent/` — see `docs/iam-docs/screenshots/README.md`).
- **Course / Learn:** `learn/<slug>/…` — course payloads, not dashboard JS (`docs/DASHBOARD_R2_ASSET_ARCHITECTURE.md`).

See also: **`docs/DASHBOARD_R2_ASSET_ARCHITECTURE.md`** for deploy scripts (`deploy-frontend.sh`, `upload-frontend-prod.sh`) and phase notes.

---

## 2. Dashboard SPA serving model

1. **Auth gate:** `/dashboard` and `/dashboard/*` require session (`src/index.js`).
2. **`/dashboard` → `/dashboard/overview`** redirect.
3. **Static attempt:** `assetKey = path.slice(1)` → ASSETS then DASHBOARD `getDashboardR2Object`.
4. **SPA fallback:** For `/dashboard/*` and `/onboarding`, if no static object — **`getDashboardSpaHtmlShell(DASHBOARD)`** returns HTML; browser loads hashed chunks from `/static/dashboard/app/*` (or legacy aliases).

Implication: **many `/dashboard/...` URLs load the same shell**; real UX is determined by **React Router**, not by distinct HTML files.

---

## 3. Dashboard route map (React)

Defined mainly in **`dashboard/App.tsx`**.

| Path | UI |
|------|-----|
| `/dashboard/agent` | **Special case:** full IDE shell (exact match only — not `/dashboard/agent/*`). |
| `/dashboard/overview` | `OverviewPage` |
| `/dashboard/health` | `HealthPage` |
| `/dashboard/learn` | `LearnPage` |
| `/dashboard/database` | `DatabasePage` |
| `/dashboard/mcp` , `/dashboard/mcp/:agentSlug?` | `McpPage` |
| `/dashboard/designstudio` | `DesignStudioPage` |
| `/dashboard/storage` | `StoragePage` |
| `/dashboard/images` | `ImagesPage` |
| `/dashboard/mail` | `MailPage` |
| `/dashboard/meet` | `MeetPage` |
| `/dashboard/calendar` | `CalendarPage` |
| `/dashboard/settings`, `/dashboard/settings/:sectionSlug` | `SettingsPanel` (+ redirect to `general`) |
| `/dashboard/integrations` | Redirect → `/dashboard/settings/integrations` |

**Non-dashboard auth routes:** `/auth/*`, `/onboarding`, `/api/auth/oauth/consent` (mounted in same SPA).

**Gap:** Mission-control URLs such as `/dashboard/agent/workflows` are **not** routed today; the server still serves the SPA shell, but **React has no matching `Route`** (anything under `/dashboard/agent/…` except exact `/dashboard/agent` falls through to the “other pages” branch without a matching pattern).

---

## 4. Worker API route map (selected)

**Dispatch hub:** `src/core/production-dispatch.js` (domain routing + **`/api/mcp/*`** → `src/api/mcp.js`).

**Representative Agent / workflow touchpoints** (non-exhaustive — see `docs/route-map.md` / `scripts/generate-route-map.js`):

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/agent/workflow/start` | `src/index.js` → `src/core/workflows.js` (`startWorkflow`) |
| POST | `/api/agent/workflows/trigger` | `src/api/agent.js` — inserts **`workflow_runs`** (legacy path) |
| POST | `/api/agent/approve` | `src/index.js` → approval handling |
| GET/POST | `/api/mcp/workflows` | MCP workflow list/create (`src/api/mcp.js`, shared helpers `src/core/agentsam-workflows.js`) |
| POST | `/api/workflow/run` | Generic runner (documented in route-map exports) |

Chat, terminal, themes, CMS, storage, browser invoke, etc. live under **`src/api/*.js`** modules consumed by the dispatch layer or `index.js`.

---

## 5. Workflow runtime generations (current state)

| Generation | Tables / surface | Role |
|------------|------------------|------|
| Legacy pipeline | `workflow_runs`, `workflow_steps`, `workflow_artifacts` | Trigger API still writes **`workflow_runs`** (`/api/agent/workflows/trigger`). |
| MCP workflows | `mcp_workflows`, `agentsam_mcp_workflows`, related runs | Listed/run via MCP routes and introspection in `agent.js`. |
| Agent Sam canonical (target) | `agentsam_workflows`, `agentsam_workflow_nodes`, `agentsam_workflow_edges`, `agentsam_workflow_runs`, `agentsam_execution_steps`, `agentsam_executions`, `agentsam_approval_queue`, … | **`src/core/workflows.js`** already **`INSERT INTO agentsam_workflow_runs`** on some paths — convergence work is to **stop splitting semantics** across legacy vs canonical writers. |

**Guiding principle:** Do **not** introduce a fourth executor; **remaster** existing strongest runtime (`workflows.js`, MCP runners, queue/`ctx.waitUntil` patterns) behind **one** D1 write model for new runs.

---

## 6. Canonical Agent Sam workflow target

- **Single write ledger:** New runs should persist to **`agentsam_workflow_runs`** (+ steps/events/artifacts FK graph), with legacy tables only as **compatibility views or triggers** if still needed.
- **HTTP surface (suggested, not all implemented):**

  - `GET /api/agent/workflows`, `GET /api/agent/workflows/:id`, `POST /api/agent/workflows/:id/run`
  - `GET /api/agent/workflow-runs`, `GET /api/agent/workflow-runs/:run_id`, sub-resources `events`, `steps`, `artifacts`, `metrics`
  - `POST …/approve|reject|cancel|retry`

- **UI:** Mission-control routes under `/dashboard/agent/*` **or** a sibling `/dashboard/mission/*` — requires **`App.tsx` router refactor** (today IDE uses **equality** on `/dashboard/agent`, not a nested `<Route path="agent/*">`).

---

## 7. CMS / theme / page system target

**Today (worker + dashboard):**

- Themes: `src/api/themes.js`, `src/core/cms-theme-resolve.js`, `src/core/cms-theme-active.js`, client **`dashboard/src/applyCmsTheme.ts`** (`GET /api/themes/active`, collab `theme_update`).
- CMS aggregates: `src/api/cms.js` and migrations referencing **`cms_themes`**, **`cms_pages`**, **`cms_page_sections`**, **`cms_section_components`**, **`cms_navigation_menus`**, **`cms_assets`**.

**Target (“Liquid-like” portability):**

- **D1 = structure + manifests** (sections, bindings, theme tokens).
- **R2 = blobs** (fragments, compiled snapshots, component payloads) with **stable keys** and versioning.
- **Dashboard = shell + editors** (Section editor, theme tokens panel, page composer) — fewer redeploys; hot-fixed content via CMS pipeline.

---

## 8. Quality report artifact model

**D1 / code references:**

- **`agentsam_artifacts`** — inserted from agent paths (e.g. `src/api/agent.js`).
- **`workflow_artifacts`** — legacy ledger tied to `workflow_runs`.
- **Eval / quality tables** — `agentsam_eval_*`, `quality_results` / `quality_runs` (per migrations and grep audits).

**R2:**

- Captures and overnight validation: **`captures/`**, **`reports/screenshots/`**, cron **`overnight-progress`** / admin overnight endpoints (`docs/PLATFORM_WIREFRAME_TECHNICAL_OVERVIEW.md`).

**Target:** Treat captures + eval outputs + Playwright job results as **one artifact contract** (type, `r2_key`, workspace, run_id, retention), surfaced in dashboard **ArtifactViewer** / **QualityReportViewer**.

---

## 9. File-tree refactor target vs today

### Today (abbreviated)

- **`src/api/`** — ~70 flat modules (`agent.js`, `mcp.js`, `themes.js`, `cms.js`, `workflow/summary.js`, …).
- **`src/core/`** — workflows, CMS resolve, MCP execution, terminal, routing, dashboard R2, etc.
- **`dashboard/components/`** — large flat namespace + lazy pages.

### Target shape (incremental — **barrels + moves**, not rewrite)

```
src/
  api/
    agent/
      workflows.js          # split from agent.js / index triggers (thin)
      workflow-runs.js
      approvals.js
      artifacts.js
    cms/
      pages.js
      sections.js
      themes.js             # re-export from ../themes.js initially
      assets.js
    reports/
      quality.js
      captures.js
  core/
    agentsam/
      workflowExecutor.js   # new: single orchestrator
      workflowGraph.js
      workflowEdges.js
      workflowApprovals.js
      ...
    cms/
      sectionRenderer.js    # evolve from cms.js / components
      themeResolver.js      # fold cms-theme-resolve + active
      pageComposer.js
      r2ComponentLoader.js
    r2/
      assetManifest.js
      uploadTree.js
      publicUrl.js
      contentTypes.js

dashboard/
  components/
    agent/
      WorkflowLibrary.tsx
      WorkflowRunTimeline.tsx
      ApprovalQueue.tsx
      ArtifactViewer.tsx
      ModelRoutingPanel.tsx
      ToolReadinessPanel.tsx
    cms/
      SectionEditor.tsx
      ThemeTokensPanel.tsx
      PageComposer.tsx
      ComponentRegistry.tsx
    reports/
      QualityReportViewer.tsx
      CaptureGallery.tsx
```

### Efficient migration tactics

1. **Re-export first:** Add `src/api/agent/workflows.js` that imports handlers from `agent.js`; switch **`production-dispatch`** / router imports one endpoint at a time — **no behavior change**.
2. **Move second:** Physically cut functions into new files once tests/scripts grep clean.
3. **`core/agentsam/`:** Grow **`workflowExecutor.js`** as a façade calling existing **`workflows.js`** + queue utilities; replace internals table-by-table.
4. **Dashboard:** Add **`dashboard/components/agent/`** with lazy routes when **`App.tsx`** gains nested `/dashboard/agent/*` or `/dashboard/mission/*`.
5. **Keep Worker URLs stable:** Deprecated paths remain **wrappers** (`POST /api/agent/workflows/trigger` → forwards to canonical insert).

---

## 10. Next verification commands

### Step 1 — R2 layout

> **Note:** Current Wrangler CLI in this repo (`npx wrangler r2 object`) exposes **get / put / delete**, not **`object list`**. Use one of:

- **Cloudflare Dashboard** → R2 → bucket → filter by prefix.
- **S3-compatible API** + `aws s3 ls s3://…` / **`rclone lsjson`** (see `rcloneLsJson` in `scripts/lib/r2-inventory-core.mjs`; requires `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
- **Internal inventory scripts** that depend on rclone (search repo for `rcloneLsJson`, `r2-inventory`).

Suggested prefixes to verify (align bucket names to **`wrangler*.toml`** bindings — names vary between `inneranimalmedia`, `agent-sam`, `inneranimalmedia-assets` across docs):

- `static/dashboard/app/`, `static/dashboard/agent/`, `dashboard/app/`
- `captures/`, `reports/screenshots/`, `screenshots/`
- `src/components/`, `pages/` (public site ASSETS, if applicable)

### Step 2 — Dashboard shell keys (✅ run 2026-05-07)

```bash
rg -n "static/dashboard/app.html|static/dashboard/app/index.html|static/dashboard/agent.html|dashboard/app/agent.html|getDashboardSpaHtmlShell" src
```

Hits: `src/index.js`, `src/core/dashboard-r2-assets.js` (lines 50–58).

### Step 3 — Dashboard React routes (✅ run 2026-05-07)

```bash
rg -n "path=.*dashboard|Route path|<Route" dashboard/App.tsx dashboard/components dashboard/src
```

### Step 4 — Workflow route writers (✅ run 2026-05-07)

```bash
rg -n "INSERT INTO .*workflow_runs|INSERT INTO agentsam_workflow_runs|/api/agent/workflow|/api/agent/workflows|/api/workflow/run|/api/mcp/workflows" src scripts migrations docs
```

Key hits: `src/api/agent.js` (`workflow_runs`), `src/index.js` (`/api/agent/workflow/start`), `src/core/workflows.js` (`agentsam_workflow_runs`), `src/core/agentsam-workflows.js`, route-map docs.

### Step 5 — Artifacts / reports (✅ sampled 2026-05-07)

```bash
rg -n "agentsam_artifacts|workflow_artifacts|quality_report|create_quality_report|captures/|trace\\.zip|video\\.webm|screenshots" src scripts dashboard docs migrations
```

### Step 6 — CMS / themes (✅ run 2026-05-07 — large output)

```bash
rg -n "cms_themes|cms_pages|cms_page_sections|cms_section_components|cms_navigation_menus|cms_assets|themes/active|applyCmsTheme|section" src dashboard migrations docs
```

---

## Short platform overview

Inner Animal Media already has a **Worker control plane**, **D1 operational brain**, **R2 asset layer**, **authenticated React dashboard**, **Agent Sam** orchestration tables, **MCP/tool runtime**, **model routing**, **Playwright validation**, and **CMS/theme** infrastructure.

The gap is **canonical ownership**: align workflow **writes** to **`agentsam_*`**, surface **runs / approvals / artifacts / quality** in the dashboard, and treat **CMS + R2 manifests** as the portability layer so sectional edits and theme tokens ship **without** redeploying the entire bundle for every content change.

This document is the checklist anchor for that refinement pass.
