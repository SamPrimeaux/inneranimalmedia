# Platform master plan: mobile UX, performance, agent data, observability, documentation

This document is the **single architectural briefing** for ten parallel workstreams. It assumes the **agent-dashboard** React app (`agent-dashboard/src/`, Vite build → `dist/agent-dashboard.js` / `.css`, served from R2 at `agent-sam/static/dashboard/agent/`) and the **main Worker** (`worker.js`, deployed as `inneranimalmedia` per `wrangler.production.toml`). It references **D1** (`inneranimalmedia-business` binding `env.DB` in production unless noted).

---

## Current system map (minimal)

```
Browser (dashboard/agent.html ?v=N)
  -> loads /static/dashboard/agent/agent-dashboard.js (React SPA entry main.jsx)
  -> AgentDashboard.jsx (orchestrator: chat, preview strip, bottom dock AgentBottomPanel)
       -> FloatingPreviewPanel.jsx (viewer tabs: browser, code, settings, git, …)
       -> SettingsPanel.jsx (settings vault, MCP, network, …)
       -> AgentBottomPanel.jsx (terminal xterm, output/problems/mcp JSON, Quick Actions)
  -> fetch same-origin /api/* handled by worker.js
```

**Auth:** Session cookies; many `/api/agent/*` routes use `getAuthUser` / `getSession`.

**Data planes:** D1 (canonical business + agent tables), KV (`SESSION_CACHE`, OAuth state), R2 (`DASHBOARD` = agent-sam for static HTML/JS), Queues, Durable Objects (IAM collab, chess), Vectorize, Hyperdrive, etc.

---

## 1. Mobile layout audit (iPhone-first)

### 1.1 Current behavior (code facts)

| Mechanism | Location | Behavior |
|-----------|----------|----------|
| Breakpoint | `AgentDashboard.jsx` ~1086–1087 | `isMobile = window.innerWidth < 768`; resize listener ~1197–1200 |
| Chat vs preview | ~2659, ~4682–4687 | Desktop: split `panelWidthPct`; mobile: chat `flex 1 1 0%`, viewer strip differs |
| Preview when mobile | ~4423 vs ~4459 | `previewOpen && !isMobile` vs `isMobile &&` alternate layouts |
| Touch on split drag | ~1628–1708 | `touchmove` / `touchend` on panel drag handles |
| Bottom dock | `AgentDashboard.jsx` + `AgentBottomPanel.jsx` | Column flex; dock second child; **not** obviously `safe-area-inset` aware |

### 1.2 UX gaps typical for desktop-first apps

- **Touch targets:** Apple HIG recommends **44×44 pt** minimum; many icon buttons in strip/toolbars are **36px** (`VIEWER_STRIP_TAB_ORDER` buttons). Risk: miss-taps on iPhone.
- **Chat input:** Textarea height, font size (13px), accessory row (+ menu), keyboard covering input — need `visualViewport` / `env(safe-area-inset-bottom)` padding on fixed bottom areas.
- **Bottom panel on small screens:** Full-width dock at 220px consumes most of viewport; **Ctrl+`** irrelevant on iPhone — need **visible control** (already: terminal icon on strip opens dock). Consider **collapse to a single row** or **sheet** pattern.
- **Horizontal overflow:** `wordBreak`, `minWidth: 0` on flex children — audit any panel that forces horizontal scroll.
- **SettingsPanel:** ~6170 lines, dense tables — horizontal scroll vs reflow.

### 1.3 Recommended audit procedure (Cursor execution)

1. **Inventory** all `style={{` and `className` in `AgentDashboard.jsx`, `AgentBottomPanel.jsx`, chat input region, mobile overflow menu.
2. **Measure** tap targets (computed height/width) for: strip icons, bottom tab row, Quick Actions Run buttons, `+` menu items.
3. **Define tokens:** e.g. `--tap-min: 44px` in theme CSS vars; apply to primary actions on mobile only (`@media (max-width: 767px)`).
4. **Bottom dock:** When `isMobile && bottomDockOpen`, optionally cap `maxHeight` to `40vh` or use `dvh` units; add bottom padding `max(env(safe-area-inset-bottom), 12px)`.
5. **Acceptance:** No interactive control < 40px on mobile; chat input remains visible with keyboard (manual test on Safari iOS).

### 1.4 Files likely touched

- `agent-dashboard/src/AgentDashboard.jsx` (layout, input bar, dock visibility)
- `agent-dashboard/src/AgentBottomPanel.jsx` (tab bar height, Quick Actions cards)
- `agent-dashboard/src/index.css` or theme injection (safe-area utilities)
- `dashboard/agent.html` / `static/dashboard/agent.html` — verify `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` for notch/safe-area

---

## 2. Loading states (no empty flash)

### 2.1 Principle

Every **user-visible** async region should have one of:

- **Skeleton** (placeholder geometry matching final layout), or
- **Spinner** (inline or overlay), or
- **Explicit “Loading…”** with stable min-height

**Anti-pattern:** `data === null ? null : <List />` with no intermediate state.

### 2.2 Fetch inventory (non-exhaustive — re-grep when implementing)

| Area | Endpoint / trigger | Current risk |
|------|-------------------|--------------|
| Boot | `GET /api/agent/boot` | Sets state after resolve — models/agents flash empty |
| Session messages | `GET /api/agent/sessions/:id/messages` | Message list empty until load |
| Session meta | `GET /api/agent/sessions/:id` | Title/star may pop |
| Queue | `GET /api/agent/queue/status` | Queue indicator |
| Commands | `GET /api/commands` | Slash picker empty |
| Chat send | `POST /api/agent/chat` | Streaming — different pattern (typing indicator exists?) |
| Settings tabs | Many `fetch` in `SettingsPanel.jsx` | Per-tab loading flags partially present |
| Quick Actions MCP | `GET /api/mcp/services/health` | “No services” vs loading |
| MCP tab (bottom) | Same | JSON dump after load |

### 2.3 Implementation pattern

- Introduce **`useFetchState`** hook or consistent `{ data, error, status: 'idle'|'loading'|'success'|'error' }`** per feature.
- **Skeleton components:** `ChatMessagesSkeleton`, `BootBannerSkeleton`, reuse CSS vars for shimmer (no hex).
- **Acceptance:** Slow 3G throttle in DevTools — no layout jump > 8px without skeleton.

### 2.4 Files

Primarily `AgentDashboard.jsx`, `SettingsPanel.jsx`, `AgentBottomPanel.jsx`, optionally `agent-dashboard/src/components/skeletons/*` if split.

---

## 3. Bundle size audit and lazy loading (823KB JS)

### 3.1 Current build shape

- **Vite** single entry `src/main.jsx` → `agent-dashboard.js` (one main bundle unless dynamic imports exist).
- **Heavy deps in main path:** `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `@monaco-editor/react` (FloatingPreviewPanel), React, etc.
- **Config:** `agent-dashboard/vite.config.js` — no `manualChunks`; `chunkFileNames: "agent-dashboard-[name].js"` only applies when Rollup emits chunks.

### 3.2 Audit command

```bash
cd agent-dashboard
npm install -D rollup-plugin-visualizer
# Add to vite.config.js plugins: visualizer({ open: true, gzipSize: true, filename: 'dist/stats.html' })
npm run build
# Open dist/stats.html — treemap shows xterm, monaco, react, etc.
```

(Or use `vite-bundle-visualizer` / `rollup-plugin-visualizer` — same idea.)

### 3.3 Lazy-load strategy for xterm (recommended)

**Today:** `AgentBottomPanel.jsx` static-imports Terminal + addons + CSS at top level → always in main bundle.

**Target:**

1. `import()` **only when** `bottomDockOpen && activeTab === 'terminal'` (or first time terminal tab mounts):
   - Dynamic `import('@xterm/xterm')`, `import('@xterm/addon-fit')`, `import('@xterm/addon-web-links')`
   - Dynamic `import('@xterm/xterm/css/xterm.css')` — Vite may emit separate CSS chunk; ensure it loads before `Terminal.open`.
2. While chunk loads, show **spinner** in terminal area.
3. **Fallback:** Keep ansi strip path removed — xterm only after load.

**Caveat:** `runCommandInTerminal` and WS still live in same component — only the **renderer** is lazy.

**Expected win:** Main chunk −~200–400KB gzipped depending on tree-shaking; exact numbers from visualizer.

### 3.4 Monaco (larger than xterm)

**FloatingPreviewPanel** pulls Monaco — often **largest** slice. Options:

- Lazy-load **Editor** tab only when user opens Code/Monaco first time.
- Use `React.lazy` for `FloatingPreviewPanel` sub-imports (surgical — rules say surgical edits to FloatingPreviewPanel).

### 3.5 Files

- `agent-dashboard/vite.config.js` — visualizer plugin (dev-only or committed artifact path under `dist/`, gitignored)
- `agent-dashboard/src/AgentBottomPanel.jsx` — dynamic import boundary
- Optional: `docs/bundle-audit-YYYY-MM-DD.md` — paste top 10 modules from stats

---

## 4. Parallel API calls (chat bootstrap latency)

### 4.1 Current sequential patterns to verify

In `AgentDashboard.jsx`:

- **Boot** ~1211–1231: single `fetch('/api/agent/boot')` — OK as one aggregate endpoint (worker already batches D1 reads in `/api/agent/boot` ~7544+).
- **On OAuth message** ~1254: second boot fetch for integrations — OK.
- **When `currentSessionId` set:** Multiple `useEffect`s each fetch **sessions/messages**, **sessions/:id**, **queue/status** — potentially **three round-trips** in parallel **if** effects run same tick; if **chained** in one effect, fix with `Promise.all`.

**Action:** Grep `useEffect` dependencies involving `currentSessionId` and trace order. Consolidate:

```javascript
Promise.all([
  fetch(`/api/agent/sessions/${id}/messages`),
  fetch(`/api/agent/sessions/${id}`),
  fetch(`/api/agent/queue/status?session_id=${id}`),
])
```

with single loading state — reduces tail latency by `min(0, RTT2+RTT3)` vs sequential.

### 4.2 Server-side

`/api/agent/boot` already uses `env.DB.batch([...])` for agents, mcp_services, models, sessions, prompts — **good**. Avoid adding **N+1** fetches from client when one boot response could carry more (e.g. queue summary) — product tradeoff.

### 4.3 Files

- `agent-dashboard/src/AgentDashboard.jsx` — session load effects
- Optionally `worker.js` — extend `/api/agent/boot` payload (version carefully; cache implications)

---

## 5. System prompt versioning (D1, A/B, rollback)

### 5.1 Existing related data

- `iam_agent_sam_prompts` (see `/api/agent/boot` batch) — prompts with `variant`, `ab_weight`, `agent_id`.
- Agent runtime may merge prompts in `runToolLoop` / chat handler — **verify** single source of truth in `worker.js` (search `iam_agent_sam_prompts`, `system_prompt`, `buildSystemPrompt`).

### 5.2 Target schema (proposal)

```sql
-- Example — align names with existing conventions after review
CREATE TABLE agent_system_prompt_versions (
  id TEXT PRIMARY KEY,  -- e.g. spv_ + hex
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  version INTEGER NOT NULL,
  label TEXT,           -- 'prod', 'experiment_b', 'rollback-2026-03-24'
  prompt_text TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
  weight REAL DEFAULT 1.0,  -- for A/B: traffic fraction
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT,
  UNIQUE(tenant_id, version)
);
```

Or **extend** `iam_agent_sam_prompts` with `version`, `effective_from`, `effective_to` if you prefer no new table.

### 5.3 Worker behavior

- **Read path:** Chat handler loads **active** row(s); if A/B, hash `session_id` or random against `weight`.
- **Admin API:** `GET/POST /api/agent/system-prompt` (Sam-only) to insert version, activate, deactivate.
- **Audit:** Log which `version id` was used on each `agent_messages` row (optional column `system_prompt_version_id`).

### 5.4 Files

- New migration under `migrations/` or approved D1 migration script
- `worker.js` — chat path prompt assembly
- Optional: Settings UI tab “Prompt versions”

### 5.5 Governance

Sam-only writes; no auto-deploy of prompt changes without approval (align with `.cursorrules`).

---

## 6. Tool call logging (`mcp_tool_calls` non-empty)

### 6.1 Schema (from `docs/d1-agentic-schema.md`)

`mcp_tool_calls`: `id`, `tenant_id`, `session_id`, `tool_name`, `tool_category`, `input_schema`, `output`, `status`, `invoked_at`, `completed_at`, `cost_usd`, `error_message`, timestamps…

### 6.2 Worker implementation today

- **`recordMcpToolCall`** ~11769 in `worker.js` — INSERT with try/catch; failures **warn** to console, **do not** fail request.
- **Call sites:** `/api/mcp/invoke` path ~11484+, `invokeMcpToolFromChat` ~11831, runToolLoop ~6004, workflows ~12965.

### 6.3 Why “zero rows” in production (hypotheses to verify)

1. **Schema drift:** INSERT column list doesn’t match D1 table → catch swallows error (`console.warn`).
2. **Wrong env:** Writes go to different DB in dev vs prod (unlikely if one binding).
3. **Path not hit:** Chat uses tools that **bypass** `recordMcpToolCall` (e.g. internal tools with `suppressTelemetry: true`).
4. **`tenant_id` / `session_id`:** Null or FK violation — INSERT fails silently.

### 6.4 Remediation plan

1. **D1:** `SELECT COUNT(*) FROM mcp_tool_calls` and `PRAGMA table_info` vs INSERT statement in `recordMcpToolCall`.
2. **Logging:** Temporarily **elevate** catch from `console.warn` to **structured log** + optional `agent_audit_log` row on failure.
3. **Guarantee:** Every `invokeMcpToolFromChat` completion path calls `recordMcpToolCall` with **duration** = `completed_at - invoked_at` (ms), **cost_usd** if known.
4. **Dashboard:** Settings or internal report: last N tool calls.

### 6.5 Duration + cost fields

- Add **`duration_ms INTEGER`** if not present (migration) or store in `output` JSON.
- **Cost:** Map from model/MCP billing if available; else 0.

### 6.6 Files

- `worker.js` — `recordMcpToolCall`, all invoke paths
- Optional migration SQL

---

## 7. Agent cost dashboard (`agent_costs` and session-level spend)

### 7.1 Schema (`agent_costs`)

From schema doc: `id`, `model_used`, `tokens_in`, `tokens_out`, `cost_usd`, `task_type`, `user_id`, `created_at`. **No `session_id`** in canonical snippet — may need migration for per-conversation rollups.

### 7.2 Current writes (from internal docs)

- `agent_telemetry`, `spend_ledger` — broader platform metrics.
- `agent_costs` — documented as written from **runToolLoop** path in some builds; **plain chat** may only hit `agent_telemetry`.

### 7.3 Target behavior

| Layer | Storage | UI |
|-------|---------|-----|
| Per request | `agent_telemetry` or extend `agent_costs` with `session_id`, `message_id` | Debug |
| Per session | `SUM(cost_usd)` grouped by `session_id` | **Agent cost dashboard** |
| Real-time | SSE or poll `GET /api/agent/sessions/:id/cost` | Running total in header |

### 7.4 Implementation

1. **Unify cost attribution** in chat handler after each LLM response: tokens from provider response → **insert** row with `session_id`, `conversation_id`, `model_used`, `cost_usd` (use existing pricing table `ai_models` rates if available).
2. **API:** `GET /api/agent/sessions/:id/metrics` returning `{ tokens, cost_usd, last_updated }`.
3. **Dashboard:** Small pill in `AgentDashboard` header next to session name (reuse cost popover pattern ~1030+).

### 7.5 Files

- `worker.js` — chat streaming completion hooks
- `agent-dashboard/src/AgentDashboard.jsx` — display
- D1 migration if new columns

---

## 8. Error surfacing → Problems tab

### 8.1 Current state

- `AgentBottomPanel.jsx` — `problemsLog` is **useState(() => [])** — **never populated**; tab shows static empty message.
- Worker **`console.error`** — Cloudflare Workers logs / Tail only; **not** pushed to client.

### 8.2 Architecture options

| Option | Pros | Cons |
|--------|------|------|
| **A. Polling** `GET /api/agent/problems?session_id=` | Simple | Latency, noise |
| **B. SSE** from worker on error | Real-time | Connection overhead |
| **C. Client captures** failed `fetch` | No worker change | Misses server-only errors |
| **D. D1 `agent_audit_log`** tail | Durable | Needs writer on every failure |

**Recommended hybrid:**

1. **Client:** In central `fetch` wrapper or `useEffect` on chat/MCP failures, `pushProblem({ source, message, at })` to React state **lifted** to `AgentDashboard` and passed to `AgentBottomPanel` as `problemsFeed` prop.
2. **Server:** `worker.js` on caught D1 errors, append to **KV list** keyed by `session_id` (TTL 1h) or insert **`agent_audit_log`** with `category: 'd1_error'`, expose `GET /api/agent/session-errors?session_id=`.

3. **Problems tab:** Render merged client + server lines, cap 200 lines.

### 8.3 Worker log forwarding

**Workers Tail** is the right place for ops; for **product UI**, avoid piping raw `console.error` (PII). Instead **structured events**: `{ code, route, session_id, safe_message }`.

### 8.4 Files

- `agent-dashboard/src/AgentDashboard.jsx` — state + pass props
- `agent-dashboard/src/AgentBottomPanel.jsx` — render `problemsFeed`
- `worker.js` — optional API + D1/KV writers

---

## 9. Auto-generated API docs (`docs/api-reference.md`)

### 9.1 Approach

**Input:** `worker.js` (~17k lines) — ~100+ route branches (`pathLower ===`, `startsWith`, `match`).

**Parser strategy (script in `scripts/`):**

1. **Tokenize** or regex scan for patterns:
   - `if (pathLower === '...' && method ...)`
   - `if (pathLower.startsWith('/api/...'))`
2. Extract **method**, **path**, nearby `getAuthUser` / `return jsonResponse({` for response hints.
3. **Emit Markdown** tables per prefix: `/api/agent/*`, `/api/mcp/*`, `/api/oauth/*`, etc.
4. **Run** on CI or pre-commit; **fail** if route count drops unexpectedly (optional).

### 9.2 Limitations

- Dynamic paths (`match(/^\/api\/foo\/([^/]+)/`) — document as **parameterized**.
- **Auth** inferred from `getAuthUser` presence — manual review badge.

### 9.3 Output shape (example)

```markdown
## POST /api/agent/chat
- **Auth:** Session required
- **Body:** JSON `{ messages, session_id, ... }`
- **Response:** SSE stream / JSON error
```

### 9.4 Files

- `scripts/generate-api-reference.js`
- `docs/api-reference.md` (generated; or template + generated section)

### 9.5 Cross-reference

Existing `docs/route-map.md` (if generated by `scripts/generate-route-map.js`) — **merge or dedupe** to avoid drift.

---

## 10. Cursor session log cleanup + sprint index

### 10.1 Current state

- `docs/cursor-session-log.md` — **~9000+ lines**, chronological entries, mixed formats over time.

### 10.2 Archive procedure

1. **Copy** `docs/cursor-session-log.md` → `docs/archive/cursor-session-log-through-YYYY-MM-DD.md` (or split by year).
2. **Truncate** active log to last **N** entries or empty with pointer: “Continued from archive …”
3. **Git** keeps history — archive is for human reading.

### 10.3 `docs/sprint-index.md` structure

| Section | Content |
|---------|---------|
| Meta | How sprints are defined (calendar week vs feature batch) |
| Table | `Date range | Theme | Worker version IDs | R2 keys changed | DB migrations | Highlights` |
| Per sprint | Bullet list: shipped features, known issues, rollback notes |
| Links | To `api-reference.md`, bundle audits, D1 migrations |

**Generation:** Semi-automated — parse `cursor-session-log.md` headers `## YYYY-MM-DD` and deploy sections “version ID”, or **manual** curation for quality.

### 10.4 Files

- `docs/archive/*`
- `docs/sprint-index.md`
- `docs/cursor-session-log.md` (trimmed)

---

## Dependency graph (recommended order)

```
10 (docs cleanup) ── parallel ── 9 (api-reference generator)

3 (bundle) + 4 (parallel fetches) ── frontend perf

1 (mobile) + 2 (loading) ── UX

6 (mcp_tool_calls) + 7 (costs) ── data correctness → feeds 8 (problems) partially

5 (prompt versioning) ── independent backend track

8 (problems) ── depends on product decision (KV vs D1 vs client-only)
```

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Lazy xterm breaks terminal on slow networks | Loading spinner; retry open |
| Parallel fetch race conditions | Single state machine; stable ordering |
| D1 migrations on production | Sam approval; `d1-schema-and-records.mdc` workflow |
| `mcp_tool_calls` INSERT failure silent | Log + alert; fix schema first |
| API doc generator false positives | Human review section in doc |

---

## Acceptance checklist (global)

- [ ] iPhone Safari: no critical tap targets < 44px on primary flows
- [ ] No unguarded empty UI after slow network
- [ ] Main bundle reduced measurably after lazy xterm (stats.html proof)
- [ ] Session load: parallel network proof (DevTools waterfall)
- [ ] D1: `mcp_tool_calls` count increases on tool use; `agent_costs` or session metrics non-empty for chat
- [ ] Problems tab shows at least client-side fetch failures
- [ ] `docs/api-reference.md` generated and committed
- [ ] `docs/sprint-index.md` + archived session log

---

*Document version: 2026-03-24. Maintainer: platform / Agent Sam. Update when worker or dashboard architecture shifts.*
