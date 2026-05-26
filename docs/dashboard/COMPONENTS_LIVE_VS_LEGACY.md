# Dashboard components — live vs legacy

**Last verified:** 2026-05-25  
**Scope:** `dashboard/components/` (+ related routes in `dashboard/App.tsx`)  
**Canonical UI:** Vite React SPA (`dashboard/` → `npm --prefix dashboard run build` → R2 `static/dashboard/app/`)

---

## How routing works (why HTML shells are legacy)

1. Authenticated `/dashboard/*` requests hit the Worker (`src/index.js`).
2. If no exact R2 static object exists for the path, the Worker serves the **single SPA shell** (`getDashboardSpaHtmlShell`).
3. **React Router** in `dashboard/App.tsx` picks the page.

Repo files like `dashboard/finance.html` are **pre-SPA shells**. They are not mounted by React Router for normal URLs such as `/dashboard/overview`. Treat them as archival unless you still upload them to R2 for a direct `.html` URL.

---

## Live — wired into the SPA

### App shell (IDE) — direct `App.tsx` imports

| File | Role |
|------|------|
| `ChatAssistant.tsx` | Re-export → `features/agent-chat/ChatAssistant.tsx` |
| `WorkspaceDashboard.tsx` | Agent home |
| `AgentQuickstartPage.tsx` | `/dashboard/agent/quickstart` |
| `MCPPanel.tsx` | MCP sidebar |
| `WorkspaceLauncher.tsx` | Workspace picker |
| `XTermShell.tsx` | Terminal (`TerminalSessionPane.tsx`) |
| `ExtensionsPanel.tsx` | Extensions |
| `MonacoEditorView.tsx` | Code tab |
| `MonacoSurface.tsx` | Shared Monaco host (`DatabasePage`, settings MCP) |
| `LocalExplorer.tsx` | Files (`VirtualizedFileTree.tsx`) |
| `BrowserView.tsx` | Browser tab |
| `StatusBar.tsx` | Bottom bar |
| `DatabaseBrowser.tsx` | SQL explorer (`DatabaseAgentChat`, `SQLConsole`, `DataGrid`) |
| `UnifiedSearchBar.tsx` | Command palette (live; replaces empty `GlobalSearchPage.tsx`) |
| `GitHubActionsPanel.tsx`, `GitHubExplorer.tsx` | GitHub |
| `KnowledgeSearchPanel.tsx`, `GoogleDriveExplorer.tsx` | Knowledge / Drive |
| `SourcePanel.tsx` | Source control |
| `MeetShellPanel.tsx` | Meet dock |
| `ExcalidrawView.tsx` | Draw tab + `MeetPage` |
| `ToolLauncherBar.tsx`, `UIOverlay.tsx` | Design studio chrome |
| `AgentImageGenerationCard.tsx` | Agent image UI (`ProgressiveImagePreview.tsx`) |
| `auth/*` | Sign-in, sign-up, OAuth consent |
| `onboarding/OnboardingPage.tsx` | `/onboarding` |

**Also live outside `components/`:** `dashboard/features/agent-chat/*`, `features/moviemode/*`, `features/agent-presence/*`, `dashboard/src/components/*` (e.g. `SetiFileIcon`, `ThinkingCard`).

### Routed pages — lazy `App.tsx` routes

| Route | Primary `components/` entry |
|-------|-----------------------------|
| `/dashboard/overview` | `overview/index.tsx` via `OverviewPage.tsx` |
| `/dashboard/analytics/:tab` | `pages/AnalyticsPage.tsx` → `analytics/*` |
| `/dashboard/learn` | `LearnPage.tsx` → `learn/LearningOS.tsx` |
| `/dashboard/projects` | `projects/NewProjectModal.tsx` + `pages/projects/*` |
| `/dashboard/tasks` | `pages/tasks/*` |
| `/dashboard/workflows` | `pages/workflows/components/*` (not under `components/`) |
| `/dashboard/library` | `library/*` via `pages/library/LibraryPage.tsx` |
| `/dashboard/database` | `DatabasePage.tsx`, `database/*` |
| `/dashboard/mcp/:slug?` | `McpPage.tsx`, `mcp/McpToolPreferenceControl.tsx` |
| `/dashboard/designstudio` | `DesignStudioPage.tsx` |
| `/dashboard/images`, `/mail`, `/meet` | `ImagesPage`, `MailPage`, `MeetPage` |
| `/dashboard/calendar` | `CalendarPage.tsx` |
| `/dashboard/settings/:section` | `settings/SettingsPanel.tsx` + sections |
| `/dashboard/integrations` | Redirect → settings integrations |
| `/dashboard/storage` | Redirect → settings storage (`StoragePage.tsx` embedded) |
| `/dashboard/health/*` | Redirect → analytics (no live health UI) |

### `overview/` — live panels (`overview/index.tsx`)

```text
overview/
├── index.tsx, constants.ts, types.ts, overviewLinks.ts, primitives.tsx
└── panels/
    ├── QuickNav.tsx
    ├── OpsPillars.tsx
    ├── ModelIntelligenceCard.tsx    ← supersedes CostLatency + ModelLeaderboard panels
    ├── SpendChart.tsx
    ├── OverviewLowerGrid.tsx
    ├── WorkflowRunsChart.tsx
    ├── ToolWaterfall.tsx
    ├── ErrorInbox.tsx
    ├── TokensChart.tsx
    ├── DeploymentsTimeline.tsx
    ├── SystemHealth.tsx
    └── PulseEmpty.tsx
```

### `analytics/` — live tabs (`analytics/analyticsRegistry.ts`)

| Tab id | Component |
|--------|-----------|
| `overview` | `tabs/OverviewTab.tsx` |
| `agent` | `tabs/AgentTab.tsx` (+ `panels/AgentChatPlanTracePanel.tsx`) |
| `workers` | `tabs/WorkersTab.tsx` |
| `mcp` | `tabs/McpTab.tsx` |
| `models` | `tabs/ModelsTab.tsx` |
| `databases` | `tabs/DatabasesTab.tsx` |
| `advisors` | `tabs/AdvisorsTab.tsx` |
| `deploys` | `tabs/DeploysTab.tsx` |
| `costs` | `tabs/CostsTab.tsx` |
| `rag` | `tabs/RagTab.tsx` |
| `codebase` | `tabs/CodebaseTab.tsx` |

Shell: `AnalyticsShell.tsx`, `AnalyticsHeader.tsx`, `AnalyticsTabs.tsx`, `portable/*`, `types.ts`.

### `settings/` — live

`SettingsPanel.tsx`, `McpTokensPanel.tsx`, `StorageSettingsPanel.tsx`, `hooks/*`, `components/*` (except orphans below), `sections/*`, `settingsUi.tsx`, `types.ts`.

Live sections include: General, Workspace, PlanUsage, AIModels, Agents, ApiKeys, Integrations, GitHub, CiCd, Storage, Network, Notifications, Security, Docs, Themes, ToolsMcp, RulesSkills, Hooks.

### `learn/` — live

`LearnPage.tsx`, `LearningOS.tsx`, `MarkdownContent.tsx`, `learn.types.ts`, `learn.css`, `hooks/useLessonMarkdown.ts`, `components/LessonAssetsView.tsx`, `AssignmentPanel.tsx`, `ProgressRing.tsx`.

### `library/`, `database/`, `themes/`, `projects/`, `mcp/`

All files in those folders are imported by live pages unless listed in [Orphan files](#orphan-files-delete-safe-pr) below.

---

## Legacy / stale (not the live product path)

### A. Pre-SPA HTML (`dashboard/*.html`) — 29 files

Do **not** delete in the orphan-components PR without a separate R2/inventory check.

```text
agent.html, auth-signin.html, overview.html, finance.html, billing.html,
billing-from-r2.html, clients.html, calendar.html, chats.html, cloud.html,
cms.html, mcp.html, images.html, mail.html, meet.html, meet-from-r2.html,
kanban.html, tools.html, tools-code-hub.html, hub.html, pipelines.html,
time-tracking.html, user-settings.html, onboarding.html, projects.html,
iam-workspace-shell.html, platform-living-design-board.html,
index.html, index-v3.html
```

### B. Superseded routes (code may remain in bundle)

| Item | Replaced by |
|------|-------------|
| `pages/HealthPage.tsx` + `components/health/*` | `/dashboard/analytics/*` (routes redirect; `HealthPage` lazy import is unused) |
| `IntegrationsPage.deprecated.tsx` | `settings/sections/IntegrationsSection.tsx` |
| `GlobalSearchPage.tsx` | `UnifiedSearchBar.tsx` in shell |
| `StudioSidebar.tsx` | Inline layout in `DesignStudioPage.tsx` |
| Overview v1 panels (see orphan list) | Overview remaster v2 in `overview/index.tsx` |
| `dashboard/Finance.jsx` + `finance-entry.jsx` | No `App.tsx` route; `QuickNav` still links `/dashboard/finance` (dead link) |

### C. Dead code in live files (not file deletes)

| Location | Issue |
|----------|--------|
| `overview/index.tsx` | Fetches `/api/overview/kpi-strip` into `kpi` state but never renders `KpiStrip` |
| `App.tsx` | `HealthPage` lazy import — no `<Route>` renders it |
| `overview/panels/QuickNav.tsx` | Link to `/dashboard/finance` with no React route |

---

## Orphan files (delete-safe PR)

Verified with ripgrep: **no `import` from another live dashboard module** (only self-references, comments, or audit docs).

### Tier 1 — delete files only (28 files)

No `App.tsx` edits required except optional cleanup of the **commented** `ProblemsDebugPanel` import.

| # | Path | Notes |
|---|------|--------|
| 1 | `dashboard/components/GLBViewer.tsx` | Zero importers |
| 2 | `dashboard/components/GlobeErrorState.tsx` | Zero importers |
| 3 | `dashboard/components/JsonModal.tsx` | Zero importers |
| 4 | `dashboard/components/PromptModal.tsx` | Zero importers |
| 5 | `dashboard/components/GlobalSearchPage.tsx` | Empty file (0 bytes) |
| 6 | `dashboard/components/IntegrationsPage.deprecated.tsx` | Route redirects to settings |
| 7 | `dashboard/components/ProblemsDebugPanel.tsx` | Only commented import in `App.tsx` |
| 8 | `dashboard/components/StudioSidebar.tsx` | Comment reference in `DesignStudioPage.tsx` only |
| 9 | `dashboard/components/SignalDot.tsx` | Only used by orphan `OverviewToolbar` |
| 10 | `dashboard/components/overview/OverviewToolbar.tsx` | Not used by `overview/index.tsx` |
| 11 | `dashboard/components/overview/panels/KpiStrip.tsx` | Not imported (`KpiStripData` type remains in `types.ts`) |
| 12 | `dashboard/components/overview/panels/ActiveProjects.tsx` | Overview v1 |
| 13 | `dashboard/components/overview/panels/BudgetCard.tsx` | Overview v1 |
| 14 | `dashboard/components/overview/panels/ModelLeaderboard.tsx` | Replaced by `ModelIntelligenceCard` |
| 15 | `dashboard/components/overview/panels/RagHealth.tsx` | RAG on analytics `RagTab` |
| 16 | `dashboard/components/overview/panels/SystemPulseGrid.tsx` | Overview v1 |
| 17 | `dashboard/components/overview/panels/TopServices.tsx` | Overview v1 |
| 18 | `dashboard/components/overview/panels/WorkflowPanel.tsx` | Overview v1 |
| 19 | `dashboard/components/overview/panels/CostLatency.tsx` | Logic in `ModelIntelligenceCard`; `CostLatencyPoint` type stays in `types.ts` |
| 20 | `dashboard/components/overview/panels/RoutingDecisions.tsx` | Zero importers |
| 21 | `dashboard/components/learn/LessonView.tsx` | `LearningOS` uses `MarkdownContent` |
| 22 | `dashboard/components/learn/CourseNav.tsx` | Zero importers |
| 23 | `dashboard/components/learn/MarkdownLite.tsx` | Zero importers |
| 24 | `dashboard/components/settings/components/McpServerCard.tsx` | `ToolsMcpSection` inlined UI |
| 25 | `dashboard/components/settings/components/McpToolRow.tsx` | Zero importers |
| 26 | `dashboard/components/settings/mcp/McpMonacoHost.tsx` | Zero importers |
| 27 | `dashboard/components/analytics/tabs/D1TelemetryTab.tsx` | Duplicate name; health tab unused; analytics uses `DatabasesTab` |

### Tier 2 — same PR or immediate follow-up (requires small `App.tsx` edit)

Remove unused lazy import, then delete:

| # | Path |
|---|------|
| 1 | `dashboard/pages/HealthPage.tsx` |
| 2 | `dashboard/components/health/HealthShell.tsx` |
| 3 | `dashboard/components/health/HealthScoreCard.tsx` |
| 4 | `dashboard/components/health/EmptyTelemetryState.tsx` |
| 5 | `dashboard/components/health/D1TelemetryTab.tsx` |

**`App.tsx` change (Tier 2):**

```diff
-const HealthPage = lazy(() => import('./pages/HealthPage').then((m) => ({ default: m.HealthPage })));
```

Keep `RedirectHealthToAnalytics` and existing `/dashboard/health/*` redirect routes.

### Explicitly out of scope for orphan PR

- `dashboard/*.html` — legacy shells; separate R2 audit
- `dashboard/Finance.jsx`, `finance-entry.jsx` — separate legacy entry
- `scripts/patch_results/**` — backups
- Live-file cleanup only: `overview/index.tsx` dead `kpi` fetch/state

---

## Delete-safe PR checklist

Use this for a **files-only** cleanup PR (Tier 1), then Tier 2.

### Branch & scope

- [ ] Branch name suggestion: `chore/dashboard-prune-orphan-components`
- [ ] PR title: `chore(dashboard): remove orphan component modules`
- [ ] Scope: Tier 1 (28 files) ± Tier 2 (5 files + 1 `App.tsx` line)

### Pre-delete verification

```bash
cd /Users/samprimeaux/inneranimalmedia

# Re-run orphan check (expect no imports outside deleted paths)
for f in \
  dashboard/components/GLBViewer.tsx \
  dashboard/components/GlobeErrorState.tsx \
  dashboard/components/JsonModal.tsx \
  dashboard/components/PromptModal.tsx \
  dashboard/components/GlobalSearchPage.tsx \
  dashboard/components/IntegrationsPage.deprecated.tsx \
  dashboard/components/ProblemsDebugPanel.tsx \
  dashboard/components/StudioSidebar.tsx \
  dashboard/components/SignalDot.tsx \
  dashboard/components/overview/OverviewToolbar.tsx \
  dashboard/components/overview/panels/KpiStrip.tsx \
  dashboard/components/overview/panels/ActiveProjects.tsx \
  dashboard/components/overview/panels/BudgetCard.tsx \
  dashboard/components/overview/panels/ModelLeaderboard.tsx \
  dashboard/components/overview/panels/RagHealth.tsx \
  dashboard/components/overview/panels/SystemPulseGrid.tsx \
  dashboard/components/overview/panels/TopServices.tsx \
  dashboard/components/overview/panels/WorkflowPanel.tsx \
  dashboard/components/overview/panels/CostLatency.tsx \
  dashboard/components/overview/panels/RoutingDecisions.tsx \
  dashboard/components/learn/LessonView.tsx \
  dashboard/components/learn/CourseNav.tsx \
  dashboard/components/learn/MarkdownLite.tsx \
  dashboard/components/settings/components/McpServerCard.tsx \
  dashboard/components/settings/components/McpToolRow.tsx \
  dashboard/components/settings/mcp/McpMonacoHost.tsx \
  dashboard/components/analytics/tabs/D1TelemetryTab.tsx; do
  base=$(basename "$f" .tsx)
  rg -l "from ['\"].*${base}|import.*${base}" dashboard --glob '*.{tsx,ts}' | grep -v "^${f}$" || true
done
```

### Delete commands (Tier 1)

```bash
cd /Users/samprimeaux/inneranimalmedia

git rm -f \
  dashboard/components/GLBViewer.tsx \
  dashboard/components/GlobeErrorState.tsx \
  dashboard/components/JsonModal.tsx \
  dashboard/components/PromptModal.tsx \
  dashboard/components/GlobalSearchPage.tsx \
  dashboard/components/IntegrationsPage.deprecated.tsx \
  dashboard/components/ProblemsDebugPanel.tsx \
  dashboard/components/StudioSidebar.tsx \
  dashboard/components/SignalDot.tsx \
  dashboard/components/overview/OverviewToolbar.tsx \
  dashboard/components/overview/panels/KpiStrip.tsx \
  dashboard/components/overview/panels/ActiveProjects.tsx \
  dashboard/components/overview/panels/BudgetCard.tsx \
  dashboard/components/overview/panels/ModelLeaderboard.tsx \
  dashboard/components/overview/panels/RagHealth.tsx \
  dashboard/components/overview/panels/SystemPulseGrid.tsx \
  dashboard/components/overview/panels/TopServices.tsx \
  dashboard/components/overview/panels/WorkflowPanel.tsx \
  dashboard/components/overview/panels/CostLatency.tsx \
  dashboard/components/overview/panels/RoutingDecisions.tsx \
  dashboard/components/learn/LessonView.tsx \
  dashboard/components/learn/CourseNav.tsx \
  dashboard/components/learn/MarkdownLite.tsx \
  dashboard/components/settings/components/McpServerCard.tsx \
  dashboard/components/settings/components/McpToolRow.tsx \
  dashboard/components/settings/mcp/McpMonacoHost.tsx \
  dashboard/components/analytics/tabs/D1TelemetryTab.tsx
```

Optional in same PR — remove commented line in `dashboard/App.tsx`:

```ts
// import { ProblemsDebugPanel } from './components/ProblemsDebugPanel';
```

### Delete commands (Tier 2)

After removing `HealthPage` lazy import from `App.tsx`:

```bash
git rm -f \
  dashboard/pages/HealthPage.tsx \
  dashboard/components/health/HealthShell.tsx \
  dashboard/components/health/HealthScoreCard.tsx \
  dashboard/components/health/EmptyTelemetryState.tsx \
  dashboard/components/health/D1TelemetryTab.tsx

rmdir dashboard/components/health 2>/dev/null || true
```

### Validation (required before merge)

```bash
npm --prefix dashboard run build
# Optional: grep built bundle does not reference deleted basenames
rg -l 'IntegrationsPage\.deprecated|StudioSidebar|ProblemsDebugPanel' dashboard/dist || echo 'OK: names absent from dist'
```

- [ ] `npm --prefix dashboard run build` succeeds
- [ ] No new `ReferenceError` on `/dashboard/overview` and `/dashboard/analytics/overview` (browser smoke)
- [ ] `/dashboard/health/overview` still redirects to analytics
- [ ] Do **not** run `deploy:frontend` unless shipping the prune

### Suggested commit message

```text
chore(dashboard): remove orphan component modules

Drop unused overview v1 panels, dead modals, deprecated integrations page,
unused learn/settings MCP helpers, and unused health/D1 telemetry UI.
No route or API behavior change for live SPA paths.
```

---

## Regenerate inventory

```bash
cd /Users/samprimeaux/inneranimalmedia
find dashboard/components -type f \( -name '*.tsx' -o -name '*.ts' \) | sort > /tmp/iam-components-all.txt
wc -l /tmp/iam-components-all.txt
```

Cross-check imports:

```bash
rg "from ['\"].*components/" dashboard/App.tsx dashboard/pages --glob '*.{tsx,ts}'
```

---

## Related docs

- [`README.md`](./README.md) — route → file map (may reference older `agent-dashboard/` paths)
- [`REPO_AND_DASHBOARD_SKETCH.md`](./REPO_AND_DASHBOARD_SKETCH.md) — Worker + Vite architecture
- [`R2-inneranimalmedia-dashboard-source-components-filetree.md`](./R2-inneranimalmedia-dashboard-source-components-filetree.md) — R2 source tree snapshot
