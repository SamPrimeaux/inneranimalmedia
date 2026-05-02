# Agent dashboard — full technical specification (wireframe + API/DB + phased rebuild)

**Status:** planning / technical decision record  
**Scope:** `/dashboard/agent` — `dashboard/agent.html` + Vite bundle (`agent-dashboard.js`) — `AgentDashboard.jsx`, `FloatingPreviewPanel.jsx`, `SettingsPanel.jsx`, `worker.js` routes.  
**Companion docs:** `docs/specs/AGENT_SETTINGS_15_TABS_WIREFRAME.txt`, `plan_iam_dashboard_v2` (if present).

---

## 1. Grep audit (commands and what they inventory)

Run from repo root (`march1st-inneranimalmedia`).

| Audit | Command | Purpose |
|--------|---------|---------|
| Settings APIs | `grep -n 'fetch\\(|/api/' agent-dashboard/src/SettingsPanel.jsx` | All settings-related HTTP calls |
| Main app APIs | `grep -n 'fetch\\(|/api/' agent-dashboard/src/AgentDashboard.jsx \| head -80` | Chat, boot, sessions, R2, commands, OAuth popups |
| Preview APIs | `grep -n 'fetch\\(|/api/' agent-dashboard/src/FloatingPreviewPanel.jsx \| head -60` | Terminal, R2, GitHub, GDrive, Playwright |
| Settings nav | `grep -n 'NAV_GROUPS\\|tabContent\\|setTab' agent-dashboard/src/SettingsPanel.jsx` | Tab ids and grouping |
| Viewer strip | `grep -n 'VIEWER_STRIP\\|ViewerPanelStripIcon' agent-dashboard/src/AgentDashboard.jsx` | Icon strip order and render sites |
| Hex debt | `grep -rn '#[0-9a-fA-F]\\{3,6\\}' agent-dashboard/src --include='*.jsx' --include='*.css' \| grep -v 'var(--' \| head -60` | Token migration backlog |

**Findings (snapshot):**

- **`SettingsPanel.jsx`:** `/api/env/secrets`, `reveal`, `roll`, `test`, `audit`; `/api/workers`; `POST /api/d1/query`; `/api/env/spend`; OAuth starts documented in tab UI; links to `/dashboard/mcp`, `/dashboard/finance`.
- **`AgentDashboard.jsx`:** `/api/agent/boot`, sessions CRUD, queue, chat, plan approve/reject, commands, `/api/r2/*`, `/api/projects`, terminal run (inline path), OAuth popup URLs.
- **`FloatingPreviewPanel.jsx`:** R2 list/get/delete, GitHub/GDrive integrations, Playwright screenshot job poll, terminal HTTP + WebSocket, `runCommandInTerminal` → **`onTabChange("terminal")`** (Git tab bug driver).
- **`FloatingPreviewPanel.jsx` path:** file is `agent-dashboard/src/FloatingPreviewPanel.jsx` (not under `components/`).
- **Settings file name:** `SettingsPanel.jsx` (no `settings.jsx`).

---

## 2. Architecture (what “multi-part” means here)

| Layer | Artifact | Role |
|--------|-----------|------|
| MPA entry | `dashboard/agent.html` | Shell CSS, theme preload, `#agent-dashboard-root`, loads `/static/dashboard/agent/agent-dashboard.js` |
| SPA island | Single React root | Entire agent UI is one tree: `AgentDashboard` → chat column + optional `FloatingPreviewPanel` |
| Build | `agent-dashboard/` Vite | Produces `agent-dashboard.js` / `.css` deployed to R2 `static/dashboard/agent/` |
| API | `worker.js` (Worker `inneranimalmedia` or staging) | All `/api/*` above |

Nested dashboard-inside-browser (screenshot of sandbox URL inside Browser tab) is **expected**: Browser tab loads a URL; that page is another full HTML shell — not a second bug by itself.

---

## 3. 2D wireframes (ASCII)

### 3.1 Viewport — agent page (desktop)

```
+-- shell (agent.html: topbar + left nav + main) ---------------------------+
| [logo] [ search / command ]     [workspace v]     [hist][?][bell][avatar] |
+---+-----------------------------------------------------------+----+-----+
| L |  Chat header: session name ... menu                         |Icon| P |
| e |  +----------------------------------------------------+    | S  | r |
| f |  |  Welcome 2x3 OR message list                        |    | t  | e |
| t |  +----------------------------------------------------+    | r  | v |
|   |  [+] [Ask v] [Auto v] [mic]  Reply.............. [send]     | i  | i |
|   |  status: Agent Sam    Auto - model                           | p  | e |
| n |                                                               |    | w |
| a |                                                               | 7  |   |
| v |                                                               |tabs|   |
+---+-----------------------------------------------------------+----+-----+
```

### 3.2 Viewer strip (right edge of chat row) — 7 icons

Order is **fixed in code** (`AgentDashboard.jsx`):

`terminal | browser | files | code | view | git | settings`

```
   [>]   <- terminal
   (o)   <- browser (globe)
   [|]   <- files
   < >   <- code
   [ ]   <- view
   git   <- git graph
   (*)   <- settings gear
```

**Design proposal:** Keep 36x36 hit targets; active = `var(--accent)` left border 2px + `var(--bg-canvas)` fill (current). Add **optional** tooltips with keyboard hints in a later pass. **Bug fix:** Git must not steal focus to Terminal (see §8).

### 3.3 Floating preview panel (when strip open)

```
+-------- panel header: pop-out | close ----------------+
| Tab body = one of: Terminal | Browser | Files | Code | View | Git | Settings |
| (full width of preview column)                         |
+--------------------------------------------------------+
```

### 3.4 Settings panel inner layout (today)

```
+---------------------------+------------------+
|  SCROLLABLE CONTENT       |  NAV RAIL        |
|  (active tab component)   |  WORKSPACE       |
|                           |   General        |
|                           |   Usage & Spend  |
|                           |   Agents         |
|                           |  TOOLS           |
|                           |   Extensions     |
|                           |   Commands       |
|                           |  DEPLOY          |
|                           |   Wrangler       |
|                           |   Workers        |
|                           |   Data           |
|                           |  SECURITY        |
|                           |   Environment    |
|                           |   Providers      |
|                           |   Guardrails     |
|                           |  CONTEXT         |
|                           |   GitHub         |
+---------------------------+------------------+
```

**Target (Cursor 15 tabs):** Replace grouped rail with **single vertical list of 15** (labels from `AGENT_SETTINGS_15_TABS_WIREFRAME.txt`); **Environment** remains **embedded in General** content (same APIs), not removed.

---

## 4. Interaction catalog — wiring to APIs and storage

Legend: **D1** = `inneranimalmedia-business`; **R2** = bound bucket; **KV** = session/cache where applicable; **Vault** = encrypted secret store behind `/api/env/*` (implementation in worker — treat as black box API).

### 4.1 Viewer strip — icon buttons

| Control | Location | Action | API / storage | Notes |
|---------|-----------|--------|---------------|--------|
| Terminal | `AgentDashboard` ~3924 / ~4119 | Toggle panel; set `activeTab=terminal` | WS `/api/agent/terminal/ws` or HTTP `/api/agent/terminal/run`, `/api/agent/terminal/socket-url` | Default `activeTab` state is `"terminal"` |
| Browser | same | `activeTab=browser` | In-panel URL fetch / navigate; screenshot `/api/playwright/*` | |
| Files | same | `activeTab=files` | `/api/r2/buckets`, `/api/r2/list`, object GET/DELETE; GDrive `/api/integrations/gdrive/*` | Bucket picker in panel |
| Code | same | `activeTab=code` | R2 object GET/PUT; Monaco | |
| View | same | `activeTab=view` | Preview URL or HTML; GitHub raw links | |
| Git | same | `activeTab=git` | **GitPanel** runs commands via `runCommandInTerminal` → **forces Terminal tab** (bug) | Should use optional focus or inline output |
| Settings | same | `activeTab=settings` | Renders `SettingsPanel` | No extra API until tab chosen |

### 4.2 Settings rail — current tab ids → content → APIs

| Tab id | User label | Primary APIs | DB / backend (conceptual) |
|--------|------------|--------------|----------------------------|
| `general` | General | (mostly static / links) | — |
| `spend` | Usage & Spend | `GET /api/env/spend` | Spend/usage tables or aggregates (worker-defined) |
| `agents` | Agents | boot data often from parent | `GET /api/agent/boot` (agents list) — D1 `agent_ai_sam` etc. |
| `extensions` | Extensions | OAuth windows | `/api/oauth/google/start`, `/api/oauth/github/start` |
| `commands` | Commands | parent `availableCommands` | `/api/commands`; execution `/api/agent/commands/execute` |
| `wrangler` | Wrangler | terminal runner | Commands via `runCommandInTerminal` → Worker shell path (no direct D1) |
| `workers` | Workers | `GET /api/workers` | Cloudflare API via Worker |
| `d1` | Data | `POST /api/d1/query` | **D1** arbitrary SQL (auth-gated) |
| `environment` | Environment | `GET/POST/PATCH /api/env/secrets`, reveal, test, audit | **Vault** + audit table (worker) |
| `providers` | Providers | overlaps secrets / docs | Often UI + env |
| `guardrails` | Guardrails | mostly UI flags | Future: `agentsam_rules` / policy D1 |
| `github` | GitHub | slot: `GitHubFileBrowser` | `/api/integrations/github/*` |

### 4.3 Cursor 15-tab mapping (target IA)

Use the table in **`AGENT_SETTINGS_15_TABS_WIREFRAME.txt`** (General … Docs). **Implementation rule:** each new tab either **mounts an existing tab body** (rename only) or **renders disabled/“wire to API X”** per v2 “no mock toggles” policy.

### 4.4 Main chat column (high level)

| Area | Examples | APIs |
|------|-----------|------|
| Boot | Load agents, models, MCP, CICD | `GET /api/agent/boot` |
| Session | Title, star, delete | `PATCH/DELETE /api/agent/sessions/:id` |
| Messages | Send | `POST /api/agent/chat` (stream optional) |
| Queue | Cancel | `/api/agent/queue/*` |
| Attachments | Images/files | R2 upload paths in `AgentDashboard` |
| Welcome cards | Quick prompts | Client-only → chat send |
| Connectors (+) | Drive/GitHub | OAuth URLs |

---

## 5. Design system proposals

| Topic | Current | Proposal |
|-------|---------|----------|
| Hex in JSX/CSS | `SettingsPanel` provider map; `AgentDashboard` provider badges; `index.css` modes; `FloatingPreviewPanel` fallbacks | Move to **`index.css`** `:root` / `[data-theme]` only; JSX references `var(--*)` |
| Spacing | Mixed inline | Document **8px grid**; sidebar nav row height **32–36px** (match Cursor-class spec) |
| Icons | Inline SVG in strip | Optional: one `icons/ViewerStrip.jsx` map to reduce `AgentDashboard` size |
| Focus rings | Inconsistent | `outline: 2px solid var(--accent)` for keyboard users on strip + settings rail |

---

## 6. Proposed rebuild — phased diffs (outline)

This is an **implementation plan**, not a pasted git patch. Each phase should be its own PR where possible.

### Phase A — Settings shell only (`SettingsPanel.jsx`)

- Replace `NAV_GROUPS` + 12 items with **`CURSOR_SETTINGS_TABS`** constant (15 entries + `tabContent` map).
- Move **Environment** UI into **General** first section; keep **same** `EnvironmentTab` component and handlers (no API change).
- Add `localStorage` key `iam-settings-tab` for last tab (optional).
- **Diff shape:** `SettingsPanel.jsx` large edit; no `worker.js` unless new endpoints.

### Phase B — Git tab behavior (`FloatingPreviewPanel.jsx` — surgical)

- **`runCommandInTerminal`:** add parameter `{ focusTerminal?: boolean }` default `true` for existing callers; GitPanel passes `false` OR remove `onTabChange("terminal")` when caller is Git.
- **GitPanel `useEffect`:** remove auto-run on mount **or** run with `focusTerminal: false` and append output to a **Git output buffer** UI (better UX).
- **Diff shape:** ~10–40 lines in `FloatingPreviewPanel.jsx` (per project rules: line numbers + approval).

### Phase C — Viewer strip deduplication (`AgentDashboard.jsx`)

- Extract **`ViewerIconStrip({ variant: 'mobile' \| 'desktop' })`** to single source for `VIEWER_STRIP_TAB_ORDER.map(...)`.
- **Diff shape:** new file `agent-dashboard/src/components/ViewerIconStrip.jsx` or colocated; `AgentDashboard.jsx` deletes duplicate blocks.

### Phase D — Token / hex cleanup

- `index.css` + surgical JSX replacements in `SettingsPanel`, `AgentDashboard`, `FloatingPreviewPanel` (last file: minimal per rules).

### Phase E — Shell unification (cross-page, separate project)

- Shared `DashboardShell` or HTML partial strategy (see earlier architecture note); **not** required to complete agent settings redesign.

### Example “pseudo-diff” — Phase B (conceptual)

```diff
- if (onTabChange) onTabChange("terminal");
+ if (opts.focusTerminal !== false && onTabChange) onTabChange("terminal");
```

```diff
- run(`cd ${GIT_PANEL_REPO} && git status ...`);
+ // optional: lazy load on first "Refresh" click, or run(..., { focusTerminal: false })
```

---

## 7. Risk register

| Risk | Mitigation |
|------|------------|
| `FloatingPreviewPanel.jsx` rewrite drift | Surgical edits only; extract new components |
| `agent.html` breakage | One-tag-at-a-time rule; prefer Vite bundle changes |
| Sandbox vs prod R2 | Stage on `agent-sam-sandbox-cicd` first |
| Shared D1 on sandbox worker | Treat D1 writes as production-grade; UI-only experiments safe |

---

## 8. Known defects tied to this spec

1. **Git tab → Terminal:** `GitPanel` mount runs `run()` → `runCommandInTerminal` → `onTabChange("terminal")` (`FloatingPreviewPanel.jsx` ~96–98, ~907).
2. **Duplicate strip:** Two `VIEWER_STRIP_TAB_ORDER.map` blocks must stay in sync until Phase C.

---

## 9. Appendix — file map

| File | Lines (approx) | Role |
|------|----------------|------|
| `agent-dashboard/src/AgentDashboard.jsx` | ~4250 | Chat, layout, strip, mobile/desktop split |
| `agent-dashboard/src/FloatingPreviewPanel.jsx` | ~1643 | Preview tabs, terminal, integrations |
| `agent-dashboard/src/SettingsPanel.jsx` | ~1208 | Settings inner nav + tab bodies |
| `dashboard/agent.html` | ~1280 | MPA shell + bundle tags |
| `worker.js` | huge | `/api/agent/*`, `/api/env/*`, `/api/d1/query`, integrations |

---

*End of spec. Extend interaction rows in a spreadsheet if you need per-button acceptance tests; this document is the structural source of truth for engineering.*

---

## 10) Cursor-parity Settings — bridge plan (backend already strong)

Production Worker surface (routes, bindings, cron names, secret **names** only): `docs/specs/WORKER_PRODUCTION_SURFACE_REFERENCE.md`.

**Principle:** Prefer **existing** JSON routes over new worker surface until a tab truly needs a tailored aggregate.

| Settings tab (current) | Backend today | UI next step |
|------------------------|---------------|--------------|
| General + Environment | `/api/env/*` | Keep vault as-is; add theme/agent rows from `GET /api/agent/boot` or user-settings API when ready |
| Plan & Usage | `/api/env/spend` | Add link + embedded row from `spend_ledger` summary if you add `GET /api/finance/spend-summary` or reuse finance page API |
| Agents | Static | Load agents + model counts from boot or `GET /api/agent/*` session config |
| Tools & MCP | — | Replace bottom link-only strip with table from **`GET /api/mcp/tools`** (name, category, enabled); optional toggle → new PATCH route + D1 update (approve schema) |
| Hooks | Placeholder | **`GET /api/webhooks/health`** → table: source, path, `total_received`, `subscription_count`; row → docs / copy curl |
| Beta (Wrangler/Workers/D1) | Terminal + D1 query | Keep; add “last deploy” from `cloudflare_deployments` / `deployment_tracking` if exposed via GET (add thin route if missing) |
| Docs | GitHub slot | Unchanged |

**Visual (Cursor-like):**

- Nav column: fixed width ~220px, **12px** labels, active row `var(--bg-elevated)` + **2px** right accent (already close).
- Content: **H1 tab title** + optional **description** line (muted); sections with **10px uppercase** `SectionLabel` (already exists).
- **Density:** Reduce placeholder padding; use tables for tools/webhooks like Cursor’s list rows.
- **Tokens:** Move remaining hex in `SettingsPanel.jsx` to CSS vars in `index.css` (project rule).

**Git + Cloudflare Builds:** Optional; use if you want push-to-prod automation — keep **deploy approved** human gate regardless.

