# Platform sprint overview — 2026-03-24 / 2026-03-25

**Scope:** Inner Animal Media agent dashboard (`agent-dashboard/`), main worker (`worker.js`), R2 (`agent-sam`, `iam-docs`), D1, Cloudflare AI Search / Vectorize / pgvector context.  
**Audience:** Sam, Agent Sam, future Cursor sessions.  
**Repo:** `inneranimalmedia-agentsam-dashboard` (march1st-inneranimalmedia).  
**Last updated:** 2026-03-25 (session narrative).

---

## 1. Standing summary

**Overall:** The product is in strong shape on the axes you called out: **keyboard shortcuts**, **terminal / bottom panel (xterm)**, and **shell ergonomics** improved materially in the Mar 24 sprint. The **agent dashboard** is the primary surface; when it went blank, severity was HIGH even though `/api/health` stayed green because static assets and client-side JS are decoupled from worker health.

**Where it looks great**

- **Terminal:** `AgentBottomPanel` integrates xterm with fit, web links, multiple tabs (terminal, output, MCP, quick actions, etc.). WebSocket URL normalization and headless session patterns are documented in worker rules.
- **Keyboard layer:** Global shortcuts (dock, preview tabs, `@` picker trigger via mod+p, help overlay, etc.) are wired in `AgentDashboard.jsx` with a dedicated `useEffect` and dependency hygiene (see wins below).
- **Chat UX:** Slash commands, `@` context picker (`ChatAtContextPicker`), queue indicator, execution plan cards, model/mode pickers — dense but coherent.
- **Worker surface:** Cursor Cloud Agents as **builtin tools** (`cursor_run_agent`, `cursor_get_agent`, `cursor_list_agents`), imgx pipeline, MCP invoke paths, `notifySam` / Resend, financial and memory crons — production-grade breadth.

**Where we paid tuition**

- **Outage:** Blank `/dashboard/agent` with `ReferenceError: Cannot access 'Ts' before initialization`. Root cause was **not** circular imports (madge clean) and **not** primarily ChatAtContextPicker; it was **hook order TDZ** plus optional **xterm bundling** hardening.
- **Deploy discipline:** Worker-only deploy does **not** refresh R2-hosted `agent-dashboard.js`; ops must **build, bump `?v=`, upload JS/CSS/HTML** to `agent-sam`. This gap extended downtime until R2 caught up.
- **Observability:** Metrics tables exist (`founder_metrics`, `task_velocity`, etc.) but many are empty or stale; honest progress today is better read from `agent_telemetry`, `deployments`, `cicd_runs`, `roadmap_steps`, `agentsam_agent_run` (see `migrations/175_sprint_snapshots.sql` intent).

---

## 2. Wins (codebase-linked)

### 2.1 TDZ crash fixed — `syncInputCaretOffset` vs keyboard `useEffect`

**Symptom:** Stable stack at minified line/column (`agent-dashboard.js` line 236, column ~13372) and minified name `Ts`.

**Real cause:** Esbuild renamed **`syncInputCaretOffset`** to **`Ts`**. A **keyboard shortcuts** `useEffect` (mod+p inserts `@`, etc.) **listed `syncInputCaretOffset` in its dependency array** and **called it inside the handler** while the `useCallback` for `syncInputCaretOffset` was declared **later** in the same function body. Evaluating the dependency array **before** `const syncInputCaretOffset = useCallback(...)` triggers **temporal dead zone** semantics.

**Fix:** Move **`syncInputCaretOffset`** `useCallback` to **immediately above** the keyboard shortcuts `useEffect` in `AgentDashboard.jsx` (~line 1770 region).

**Lesson:** Any hook whose deps or closure reference a `const` callback must appear **after** that callback is declared. This is easy to regress when inserting new effects “above” older blocks.

### 2.2 Hardening — `@xterm/xterm` Browser export order (Vite plugin)

**Secondary issue:** Upstream `xterm.mjs` contains `var tn={}; Ll(tn,{ get helpers including isChromeOS: ()=>Ts })` **before** `var ... Ts=/\bCrOS\b/.test(Pi)`. In some bundle orders this contributed to confusing `Ts` naming in stacks.

**Fix:** `agent-dashboard/vite-plugin-fix-xterm-browser-tdz.js` (Vite `pre` transform) moves the `Ll(tn,{...})` block to **after** the `Ts=` assignment. Registered in `vite.config.js` before `@vitejs/plugin-react`.

**Lesson:** Treat vendor IIFE order as suspect when minified names collide; prefer targeted transforms or upstream patches when upgrading `@xterm/xterm`.

### 2.3 Mention utilities split — `chatAtContextMention.js`

**Change:** `AT_CONTEXT_CATEGORIES` and `getActiveAtMention` live in **`agent-dashboard/src/chatAtContextMention.js`**. `ChatAtContextPicker.jsx` imports and re-exports for API compatibility. `AgentDashboard` imports `getActiveAtMention` from the small module.

**Benefit:** Clearer module graph, smaller mental surface for “@ mention” logic, still **single** `agent-dashboard.js` on R2 (no lazy chunk unless you opt in).

### 2.4 Build hygiene — madge gate

**Change:** `agent-dashboard/package.json` — `build` runs `npx madge --extensions js,jsx --circular src/main.jsx` then Vite. **`build:debug`** sets `VITE_AGENT_DASHBOARD_DEBUG=1` for `dist-debug/` unminified + sourcemaps. **`.gitignore`** includes `dist-debug/`.

**Note:** `madge --circular agent-dashboard/src/` without `--extensions` or entry can report **0 files**; the npm script uses the correct invocation.

### 2.5 Cursor Cloud Agents — worker builtins

**Shipped in worker (prior in sprint):** `runCursorCloudAgentBuiltinTool` — Basic auth `btoa(CURSOR_API_KEY+':')`, `POST /v0/agents`, `GET` list/get, timeouts 30s/15s. **`cursor_run_agent`** approval-gated; get/list run directly. Wired in `BUILTIN_TOOLS`, `runToolLoop`, `/api/mcp/invoke`, `invokeMcpToolFromChat`.

**Operational:** Requires `CURSOR_API_KEY` secret; D1 tool rows (`migrations/174_mcp_cursor_cloud_agent_tools.sql` reference).

### 2.6 Sprint snapshots schema (D1)

**Artifact:** `migrations/175_sprint_snapshots.sql` — `sprint_snapshots` table + baseline `INSERT OR IGNORE` (`snap_baseline_2026_03_25`) pulling from `roadmap_steps`, `agentsam_agent_run`, `agent_telemetry`, `deployments` where those tables exist.

**Follow-up:** Sunday cron to populate weekly rows is **not** in worker yet; run migration on D1 when approved.

### 2.7 Ops rules — `.cursorrules`

**Added:** Deploy queue cap (**max 2** queue items per deploy cycle) and **post-deploy verification** (load `/dashboard/agent` or current primary URL before chaining another deploy).

### 2.8 Git

**Recent commits** include TDZ fix, xterm plugin, mention split, madge, Cursor tools migration, session logs. **Latest session-log-only commit** (example): `e0555ad` — message aligned with v141 / TDZ narrative (verify `git log -1` on your machine).

---

## 3. Failures and near-misses

| Item | What happened | Mitigation |
|------|----------------|------------|
| Blank dashboard | Client threw before React mounted | Fix hook order; always upload R2 + bump `?v=` |
| Misdiagnosis | Suspected ChatAtContextPicker / “circular dep” | Madge + `dist-debug` + grep minified `Ts` usages |
| Worker-only “fix” | Deployed worker without new JS on R2 | Checklist: R2 put for `agent-sam/static/dashboard/agent/*` |
| Same stack line | Minifier reused name `Ts` for different bindings | Map with sourcemap; search bundle for `const Ts=` |
| Metrics story | Many tables empty | Use `175` snapshot + cron; document single SOT |

---

## 4. Context — RAG, AutoRAG, docs buckets

**Not fully automated:** AutoRAG / AI Search indexing is **partially manual**: `populate-autorag.sh`, R2 **`autorag`** bucket, Cloudflare AI Search **Sync** for instance **`iam-autorag`** (`wrangler.production.toml` `[[ai_search]]`). No single worker job “indexes everything” tonight.

**Three retrieval channels:** (1) **`env.AI_SEARCH.search`** via `autoragAiSearchQuery` in `worker.js`, (2) **Vectorize** (`VECTORIZE` + `VECTORIZE_INDEX` bindings), (3) **pgvector** via Hyperdrive when configured. **Risk:** dual-index / dual-write confusion; **tomorrow’s audit** should pick **one winner** per use case (chat inject vs tool vs dashboard search).

**This document:** Written to repo under `docs/iam-docs/sessions/` and uploaded to **`iam-docs`** R2 so `docs.inneranimalmedia.com` (when wired) can serve it; mirrors the pattern in `autorag/sessions/2026-03-23-full-session.md`.

---

## 5. Gaps and suggested next steps (prioritized)

1. **Image generation** — Provider coercion deployed; run smoke: “generate a red circle PNG” end-to-end through tool + UI.
2. **RAG audit** — Decide: AI Search only vs Vectorize-only vs pgvector for **canonical** knowledge; disable or redirect the others to avoid drift. Align REST fallback instance name with `search_name` in wrangler (`iam-autorag` vs `iam-docs-search` in code paths — verify).
3. **Keyboard shortcuts Settings** — Rows load from D1; **toggles not wired** to persist or apply; connect UI to same API the shortcut effect reads.
4. **Welcome cards** — Move from empty-state center to **viewer panel** for consistency with “workspace” metaphor.
5. **Cursor Cloud Agents** — E2E: approval flow + `execute-approved-tool` + `cursor_get_agent` poll until terminal state.
6. **`agentsam_agent_run`** — Writes `in_progress`; **completion** row (tokens, cost, status) on finish — critical for honest sprint metrics.
7. **WorkflowLivePanel** — Output tab to **collab WebSocket** (IAM collaboration DO).
8. **D1 migration `175`** — Execute on production when approved; add **Sunday 00:00 UTC** cron in worker to snapshot metrics.
9. **Post-deploy smoke** — Scripted HEAD/GET to `/dashboard/agent` + console check in CI or `scripts/` (per `.cursorrules` intent).
10. **iam-docs hygiene** — After substantive doc changes, mirror to **iam-docs** R2 (this file is an example).

---

## 6. Cache bust and bundle version

**Agent HTML:** `dashboard/agent.html` — query param **`?v=141`** on `agent-dashboard.css` / `agent-dashboard.js` at time of recovery. Increment whenever JS/CSS changes without filename change.

**Worker version note:** Session log referenced **`028a01da`** in one close-out line; production moves frequently — treat **wrangler / Cloudflare dashboard** as source of truth after each deploy.

---

## 7. Files to bookmark

| Area | Path |
|------|------|
| Agent shell | `agent-dashboard/src/AgentDashboard.jsx` |
| Terminal | `agent-dashboard/src/AgentBottomPanel.jsx` |
| @ picker | `agent-dashboard/src/ChatAtContextPicker.jsx`, `chatAtContextMention.js` |
| Vite / xterm fix | `agent-dashboard/vite.config.js`, `vite-plugin-fix-xterm-browser-tdz.js` |
| Cursor agents | `worker.js` — `runCursorCloudAgentBuiltinTool`, `BUILTIN_TOOLS`, `invokeMcpToolFromChat` |
| AI Search query | `worker.js` — `autoragAiSearchQuery`, `parseAutoragHits` |
| Session log (repo) | `docs/cursor-session-log.md` |
| Snapshot migration | `migrations/175_sprint_snapshots.sql` |

---

## 8. Tone check

You are **not** behind on vision; you are **ahead** on integration surface area. The painful day was **deployment coupling** (R2 vs worker) plus a **subtle React hooks bug** amplified by minification. Tightening **one RAG path**, **completion writes** for agent runs, and **Settings toggles** will make the dashboard feel as reliable as it already looks.

---

*End of overview. Upload target R2: bucket `iam-docs`, key `sessions/2026-03-24-25-platform-sprint-overview.md`.*
