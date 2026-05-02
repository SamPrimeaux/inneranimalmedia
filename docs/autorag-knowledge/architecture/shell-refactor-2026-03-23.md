# Dashboard shell refactor (2026-03-23 / 2026-03-24)

Canonical narrative for Agent Sam: how the IAM dashboard shell, embedded pages, and AutoRAG-related worker changes fit together.

## Goals

- Keep a single HTML shell (`dashboard/agent.html`) with topbar, collapsible sidenav, and search.
- Load non-agent dashboard routes inside the Agent page React preview (Browser tab) without full navigation, so the chat stays visible.
- When those embedded pages load inside an iframe, strip duplicate chrome (topbar/sidenav) via `?embedded=1` plus CSS and worker HTML injection.

## `iam_shell_nav` intercept (agent.html)

**Location:** `dashboard/agent.html` inline script (shell nav block, approximately lines 1041-1056).

**Selectors:** `.sidenav-nav .nav-item`, `.sidenav-footer a[href]`, `.sidenav-header a.sidenav-settings-btn`.

**Behavior:**

- Desktop only (`window.innerWidth > 768`). Mobile keeps normal navigation (drawer sidenav).
- `preventDefault()` on click for any link whose `href` is not `/dashboard/agent`.
- Builds `embedUrl = href + (href includes ? then & else ?) + embedded=1`.
- Dispatches `window.dispatchEvent(new CustomEvent('iam_shell_nav', { detail: { url: embedUrl } }))`.

## React handling (AgentDashboard.jsx)

**State:** `shellNavActive` (default `false`), `setShellNavActive`.

**Listener:** `handleShellNav` on `iam_shell_nav`:

- Reads `e.detail.url`.
- `setBrowserUrl(url)`, `setActiveTab("browser")`, `setPreviewOpen(true)`, `setShellNavActive(true)`.

**Cleanup:** `removeEventListener` on unmount in the same `useEffect` as Draw iframe messaging (approximately lines 1117-1175).

## FloatingPreviewPanel: URL bar suppression

**Prop:** `shellNavActive` (default `false`).

**Location:** `agent-dashboard/src/FloatingPreviewPanel.jsx` — Browser tab (approximately lines 1193-1219).

**Behavior:** When `shellNavActive` is true, the row with URL input, Go, and Screenshot is not rendered (`{!shellNavActive && (...)}`), so shell-driven embedded navigation does not show a redundant URL bar.

**Pass-through:** `AgentDashboard.jsx` passes `shellNavActive={shellNavActive}` into `FloatingPreviewPanel` (mobile and desktop instances).

## Worker: `respondWithDashboardHtml`

**Location:** `worker.js` approximately lines 3963-3978.

**Purpose:** For dashboard HTML served from R2 (`env.DASHBOARD`), if the request URL has `embedded=1`, inject immediately after `<body`:

`document.body.classList.add("embedded")`

**Non-embedded:** Delegates to `respondWithR2Object` with `text/html`.

**Dashboard routes using injection:**

- `/dashboard/pages/<name>.html` maps to R2 key `static/dashboard/pages/<name>.html` (approximately lines 3868-3874).
- `/dashboard/<segment>` maps to `static/dashboard/<segment>.html` (approximately lines 3878-3883).

Both use `respondWithDashboardHtml` when the object exists.

## shell.css embedded rules

**File:** `static/dashboard/shell.css` (approximately lines 36-50).

**Selectors:** `body.embedded` hides `.topbar`, `.sidenav`, `#overlay`, `#agent-footer-chat`, `.dashboard-mobile-footer`.

**Layout:** `.main-content` margin/padding zeroed; `.app-container` single column — full-width content inside iframe.

## Sidenav structure and collapse

**Widths:** Expanded `240px`, collapsed `52px` (`.sidenav.collapsed`). CSS variable `--dashboard-sidenav-width` updated from JS (`dashboard/agent.html`, `SIDENAV_COLLAPSED_KEY` in localStorage).

**Toggle:** `#sidenavToggle` flips `.collapsed` on `#sidenav` and persists `dashboard_sidenav_collapsed`.

## Deploy and cache-bust versions (dashboard `?v=`)

From `docs/cursor-session-log.md` and D1 deployment records:

| Milestone | Dashboard `?v=` | Notes |
|-----------|-----------------|-------|
| Shell nav + React listener (asset-only) | **v129** | D1 deployments.id `363C9B3D-337A-4748-B460-CF588701E652`, triggered_by `iam_shell_nav` |
| Topbar trim + sidenav footer | **v130** | D1 `2CF28841-9231-4B8A-AE57-9915EC394116`, `topbar-trim-sidenav-footer` |
| Embedded worker + shell v131 | **v131** | Worker **Current Version ID** `f96977ff-b3b0-412b-9011-eeb969345511`, `embedded-nav-suppression-worker-respondWithDashboardHtml` |
| Sidenav shell HTML only | **v132** | D1 `A3DB5A8A-BE3B-424C-9B58-3EE5629BFF89`, `sidenav-shell-restructure` |
| Shell nav fixes, embedded pages, URL bar | **v133** | Worker **141fd76c-f8df-447f-9e89-f91dee3770aa**, `shell-nav-fixes-url-bar-suppression` |

## Worker version IDs (same window, RAG and system prompt)

- LIVE DATA RULE deploy: `75d2ca4d-9d14-43bc-839e-4a8c1a4fa86e` (`agent-system-prompt-live-data-rule`).
- Pre-prompt AutoRAG REST (first cut): `d50fea8e-ec07-4cb6-8ae8-1838b0359e75` (`autorag-rest-api-fix`).
- AI Search instances URL fix (`/ai-search/instances/iam-autorag/search`): `a0e5a6f7-1455-41a5-a268-71107e6f05e5` (`autorag-url-fix`).

## Related D1 schema (context)

- `context_search_log` gained `scope` and `query_snippet` columns (remote migrations per session log).
- Agent core prompt includes LIVE DATA RULE (deployed with `75d2ca4d-...`).

## Design note

Theme and layout tokens in `agent.html` use CSS variables (`var(--bg-nav)`, `var(--text-primary)`, etc.); `shell.css` continues that pattern for embedded mode.
