# Agent API Contract Audit

Snapshot of **current** Worker dispatch and dashboard call sites (2026-05-11). Regenerate `docs/route-map.md` with `node scripts/generate-route-map.js` after route changes; do not hand-edit that file.

## Generated Sources

| Source | Role |
| --- | --- |
| `docs/route-map.md` | Auto-generated from `src/index.js` only (coarse route titles + a small set of literal `/api/...` strings). |
| `src/core/production-dispatch.js` | Production `/api` domain dispatch, including `/api/agent`, `/api/terminal`, `/api/chat`, `/api/playwright`. |
| `src/api/agent.js` | `handleAgentRequest` — large leaf surface for agent sessions, chat, tools, DB helpers, git, boot, terminal, etc. |
| `src/api/dashboard.js` | `handleDashboardApi` — dashboard-first routes (artifacts helper, terminal passthrough, overlapping agent-shaped GETs, Playwright/Hyperdrive, etc.). |
| Dashboard TS/TSX/JS/JSX | Browser `fetch` / string URLs under `dashboard/`. |

## Production Dispatch Order

`src/index.js` delegates domain routing to `dispatchProductionDomainRoutes` (imported via `src/core/router.js` from `production-dispatch.js`); the `fetch` handler stays comparatively thin around session/auth then calls that dispatcher (see `src/index.js` ~640–653).

Within `dispatchProductionDomainRoutes`, **before** the agent/dashboard block: dedicated prefixes (e.g. `/api/agentsam`, `/api/cms`, `/api/d1`, `/api/hyperdrive`, `/api/browser` — note the last two go to `handleDashboardApi` in an earlier branch).

For **`/api/agent/*`**, **`/api/terminal/*`**, **`/api/chat/*`**, and **`/api/playwright/*`** (single contiguous block):

1. **POST** requests whose path starts with **`/api/agent`**: `handleAgentRequest` runs **first**. If the response status is **not** `404`, that response is returned.
2. **`handleDashboardApi`** runs next (covers many agent-shaped GETs, terminal, Playwright, Hyperdrive, artifacts, etc.). If status is **not** `404`, that response is returned.
3. If the path starts with **`/api/agent`**: if this was the POST-first case and step 1 produced a response, return that stored response (including `404` — no second agent pass in that branch).
4. Otherwise **`handleAgentRequest`** runs again **only for `/api/agent/*`** (typical **GET** path when `handleDashboardApi` returned `404`).

**Note:** Prefixes **`/api/terminal`**, **`/api/chat`**, and **`/api/playwright`** do **not** reach step 4; they rely on **`handleDashboardApi`** in this block only (see next paragraph).

**Confirmed behaviors (from `src/core/production-dispatch.js` ~156–174):**

- **POST `/api/agent/*`**: tries **`handleAgentRequest` first**; on `404`, falls through to **`handleDashboardApi`**; then special-case may return the first agent response or call agent again.
- **GET (and other non–POST-first methods) on `/api/agent/*`:** **`handleDashboardApi` first**; on `404`, **`handleAgentRequest`** (step 4).
- **GET/POST on `/api/terminal`, `/api/chat`, `/api/playwright` (without `/api/agent` prefix):** **`handleDashboardApi` only** in this block — no `handleAgentRequest` fallback here.

`/api/terminal`, `/api/chat`, and `/api/playwright` share the same outer `if` as `/api/agent`, but **only** `handleDashboardApi` is consulted for those prefixes here: if it returns `404`, the inner block does **not** call `handleAgentRequest` (that second call is gated on `pathLower.startsWith('/api/agent')`). So **terminal / chat / Playwright HTTP** in this branch are owned by **`handleDashboardApi`** unless another **earlier** branch in `production-dispatch.js` handles them.

Reference:

```156:174:src/core/production-dispatch.js
  if (
    pathLower.startsWith('/api/agent') ||
    pathLower.startsWith('/api/terminal') ||
    pathLower.startsWith('/api/chat') ||
    pathLower.startsWith('/api/playwright')
  ) {
    const postAgentFirst = pathLower.startsWith('/api/agent') && methodUpper === 'POST';
    let postAgentRes = null;
    if (postAgentFirst) {
      postAgentRes = await handleAgentRequest(request, env, ctx, authUser);
      if (postAgentRes.status !== 404) return postAgentRes;
    }
    const dashRes = await handleDashboardApi(request, url, env, ctx);
    if (dashRes.status !== 404) return dashRes;
    if (pathLower.startsWith('/api/agent')) {
      if (postAgentFirst && postAgentRes) return postAgentRes;
      const agentRes = await handleAgentRequest(request, env, ctx, authUser);
      if (agentRes.status !== 404) return agentRes;
    }
  }
```

## Duplicated `/api/agent/*` Paths

Overlap set from repo audit (`comm` on sorted unique path strings in `src/api/dashboard.js` vs `src/api/agent.js`):

`/api/agent/boot`  
`/api/agent/git/branches`  
`/api/agent/git/status`  
`/api/agent/notifications`  
`/api/agent/terminal/config-status`

| Path | agent.js handler | dashboard.js handler | Current effective owner | Recommendation |
| --- | --- | --- | --- | --- |
| `/api/agent/boot` | `if (path === '/api/agent/boot')` — **any method**; requires `identity?.tenantId`; tenant-scoped model query + agents/MCP/sessions batch (`src/api/agent.js` ~5553–5577). | `GET` only; `getAuthUser`; broader model picker query + `notifications`-style tables; includes `integrations: {}` placeholder (`src/api/dashboard.js` ~237–257). | **GET:** `handleDashboardApi` wins (returns first). **POST (or other):** `handleAgentRequest` runs first and matches without method guard — **agent.js** unless dashboard returned non-404. | Pick one implementation for boot payload shape; keep a single source (likely `agent.js` for tenant-aware boot) and remove or thin the duplicate. |
| `/api/agent/git/status` | `GET`; deployment row + `projectIdFromEnv(env)` for worker name (`src/api/agent.js` ~5389–5398). | `GET`; hardcoded worker name `'inneranimalmedia'` + same join pattern (`src/api/dashboard.js` ~41–68). | **GET:** **dashboard.js** responds first (non-404) — agent duplicate is **unreachable for successful dashboard handling**. | Remove dead duplicate from `agent.js` **or** stop handling in `dashboard.js` if worker name must come from env. |
| `/api/agent/git/branches` | `GET`; GitHub token via `resolveGitHubToken(authUser, env)`; repo from `github_repositories` by worker name; different JSON shape (`current`, `repo`, `branches`) (`src/api/agent.js` ~5401–5452). | `GET`; token via `resolveGitHubToken(env, authUser, owner)`; repo from latest deployment join; richer branch metadata (`src/api/dashboard.js` ~71–213). | **GET:** **dashboard.js** first — agent branch is **unreachable** when dashboard returns 200. | Align response shape with frontend (`StatusBar` / types) and delete the unused handler to prevent drift. |
| `/api/agent/notifications` | `GET`; composite: deployments + `agent_conversations` + `workspace_connectivity_status`, normalized feed (`src/api/agent.js` ~5001+). | `GET`; simple `notifications` SQL table by `recipient_id` (`src/api/dashboard.js` ~216–234). | **GET:** **dashboard.js** wins first — **very different payloads**; agent’s rich feed is **unreachable** unless dashboard returns 404. | **Critical drift risk:** rename one path or merge semantics so the UI and handler agree on which contract is live. |
| `/api/agent/terminal/config-status` | `GET`; superadmin gate; DB `terminal_sessions` row (`src/api/agent.js` ~5815–5841+). | `GET`; superadmin gate; `PTY_SERVICE`, `TERMINAL_WS_URL`, `getDefaultTerminalConnection`, etc. (`src/api/dashboard.js` ~274+). | **GET:** **dashboard.js** first. | Consolidate on dashboard’s env/bridge logic **or** agent’s DB session view; expose one contract. |

## Dashboard Frontend API Usage

Collected with:  
`rg -n "/api/agent/" dashboard --glob '*.{tsx,ts,jsx,js}'` → **59 lines** (as of this audit).

**High-impact / chat & sessions**

| Area | Files (representative) |
| --- | --- |
| Chat stream, tools, catalog | `dashboard/components/ChatAssistant.tsx` — `/api/agent/chat`, `/api/agent/chat/execute-approved-tool`, `/api/agent/sessions`, `/api/agent/models`, `/api/agent/modes`, `/api/agent/commands`, `/api/agent/context-picker/catalog` |
| Meet | `dashboard/components/MeetPage.tsx` — `/api/agent/chat` |
| Tool approvals | `dashboard/src/components/ToolApprovalModal.tsx` — `/api/agent/approval/pending`, `/api/agent/approval/` |
| Workspace + messages | `dashboard/App.tsx`, `dashboard/src/ideWorkspace.ts` — `/api/agent/workspace/…`, `/api/agent/sessions/…/messages` |
| Overview feeds | `dashboard/src/iamDashboardFeeds.ts` — `/api/agent/sessions`, `/api/agent/today-todo`, `/api/agent/problems`, `/api/agent/git/status`, `/api/agent/rules`, `/api/agent/notifications` |
| Artifacts | `dashboard/api/artifacts.ts`, `dashboard/pages/library/LibraryPage.tsx` — `/api/agent/artifacts`, `/api/agent/artifact-filters` |
| MCP workflow | `dashboard/components/McpPage.tsx` — `/api/agent/workflow/start` |
| DB browser | `dashboard/components/DatabaseBrowser.tsx` — `/api/agent/db/tables`, `…/snippets`, `…/query-history` |
| Git / status bar | `dashboard/components/MonacoEditorView.tsx`, `dashboard/components/StatusBar.tsx` — `/api/agent/git/status`, `/api/agent/git/sync`, `/api/agent/git/branches` |
| Problems | `dashboard/App.tsx`, `dashboard/components/ProblemsDebugPanel.tsx`, `dashboard/src/iamDashboardFeeds.ts` — `/api/agent/problems` |
| Terminal | `dashboard/components/TerminalSessionPane.tsx` — `/api/agent/terminal/config-status`, `…/ws`, `…/run`, `…/complete`, `/api/agent/memory/list` |
| Knowledge | `dashboard/components/KnowledgeSearchPanel.tsx` — `/api/agent/sessions` |
| Models picker | `dashboard/components/WorkspaceDashboard.tsx` — `/api/agent/models?show_in_picker=1` |

Route map also lists explicit **POST** agent entries from `index.js` (`/api/agent/approve`, `/api/agent/execute`, `/api/agent/workflow/start`) which the dashboard may call indirectly via the same patterns above.

## Orphan / Stale API Strings

**Method:** `rg --no-filename --only-matching "/api/[a-zA-Z0-9_./-]+" dashboard …` vs the same pattern on `docs/route-map.md`, then `comm -23` (dashboard-only).

**Counts:** ~**283** unique path prefixes in dashboard **not** present as substrings in `docs/route-map.md` (~**25** `/api/…` strings extracted there).

**Important limitation:** `docs/route-map.md` is built only from **`src/index.js`** string/branch scanning (`scripts/generate-route-map.js`), not from `production-dispatch.js` or modular handlers. It intentionally documents **coarse** branches (e.g. `prefix /api/*`) plus a handful of explicit routes. So **most “orphans” are not missing Worker routes** — they are **leaf paths** implemented inside `handleAgentRequest`, `handleDashboardApi`, `handleSettingsRequest`, etc.

**Classification (bulk):**

| Pattern | Typical classification |
| --- | --- |
| `/api/agent/...` leaf paths (chat, sessions, db, terminal, approval, …) | **Likely valid — route-map extraction missed** (not enumerated in `index.js`). |
| `/api/agentsam/...`, `/api/analytics/...`, `/api/settings/...`, `/api/mail/...`, etc. | Same — dispatched in `production-dispatch.js` beyond what the route map lists. |
| `/api/workspaces/list.` | **False positive:** appears from a **comment** sentence ending after `/api/workspaces/list` in `WorkspaceLauncher.tsx`; real fetches use `/api/workspaces/list`. |
| Paths containing ellipsis or non-literal fragments in source (e.g. GitHub `...` placeholders) | Treat as **documentation / template noise**, not runtime URLs. |

**When to suspect real drift:** endpoint removed from Worker but still in dashboard; or new dashboard path with **no** dispatcher branch in `production-dispatch.js`. Those need case-by-case grep into `src/` (not done exhaustively here).

---

## Commands run (audit trail)

```bash
node scripts/generate-route-map.js
rg --only-matching "/api/agent/[a-zA-Z0-9_./-]+" src/api/dashboard.js | sort -u
# vs agent.js string literals → overlap written to /tmp/agent-overlap.txt
rg -n "dispatchProductionDomainRoutes|handleAgentRequest|handleDashboardApi" src/index.js src/core/production-dispatch.js
rg -n "/api/agent/" dashboard --glob '*.{tsx,ts,jsx,js}'
rg --no-filename --only-matching "/api/[a-zA-Z0-9_./-]+" dashboard --glob '*.{tsx,ts,jsx,js}' | sort -u
rg --only-matching "/api/[a-zA-Z0-9_./-]+" docs/route-map.md | sort -u
comm -23 …  # dashboard-only paths
```

**Note:** Using `rg` without `--no-filename` on multi-file dashboard searches **prefixes matches with `path:`**, which breaks `comm` against `route-map.md`. Prefer `--no-filename` for set diffs.

---

## Alignment report (D1 / Supabase)

| Field | Value |
| --- | --- |
| `todo_id` | *Not updated — documentation-only pass per request.* |
| `plan_task_id` | *N/A* |
| `workflow_run_id` | *N/A* |
| `supabase_run_id` | *N/A* |
| D1 / Supabase SQL | *None executed.* |
| Files changed | `docs/route-map.md` (regenerated), `docs/agent-api-contract-audit.md` (this file) |
| Validation | `node scripts/generate-route-map.js` exited **0**; wrote `docs/route-map.md` (**46** route patterns). |
