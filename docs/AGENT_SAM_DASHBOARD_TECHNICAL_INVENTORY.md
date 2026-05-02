# Agent Sam Dashboard — Technical Inventory

**Generated:** 2026-03-17 (post v=56)  
**Scope:** Agent dashboard buildout — what works, what's partial, architecture, gaps.

---

## 1. Core Features (What Actually Works)

Legend: **Fully working** | **Partial/buggy** | **Stubbed** | **Not implemented**

### File System

| Feature | Status | Notes |
|--------|--------|--------|
| File browser UI | **Fully working** | FloatingPreviewPanel Files tab; list from R2 per bucket, open in Code or View |
| Monaco editor integration | **Fully working** | @monaco-editor/react in FloatingPreviewPanel; language from extension, theme from data-theme |
| File open/read | **Fully working** | GET `/api/r2/buckets/:bucket/object/:key`; open from list or from GDrive/GitHub integrations |
| File edit/save | **Fully working** | PUT `/api/r2/buckets/:bucket/object/:key` with body; Keep Changes / Undo; last-saved ref for dirty state |
| Multi-file operations | **Partial** | Single file open in Code tab; no multi-tab or multi-file diff |
| File creation | **Stubbed** | No "New file" flow in UI; can save as new key if path entered (not exposed) |
| File deletion | **Partial** | R2 DELETE exists (`/api/r2/delete`, `/api/r2/file` DELETE); dashboard uses delete for object in some flows; no generic "delete this file" in Files tab |
| File search/navigation | **Fully working** | R2 list + search (`/api/r2/list`, `/api/r2/search`); knowledge search in chat bar hits R2 + RAG + chats |
| R2 sync workflow | **Fully working** | POST `/api/r2/sync` refreshes bucket inventory; list/sync used by file browser |

### AI Coding Assistant

| Feature | Status | Notes |
|--------|--------|--------|
| Chat interface | **Fully working** | Messages list, streaming, mode (ask/agent/plan/debug), model picker, attach files/images |
| Message streaming | **Fully working** | SSE from `/api/agent/chat`; types: text, code, state, done, tool_approval_request, error |
| Context gauge / token tracking | **Fully working** | Mini donut 20px; totalChars from messages (excluding provider===system); estimatedTokens = ceil(chars/4); popover with context + cost |
| Chat history persistence | **Fully working** | Sessions in D1; GET/PATCH/DELETE `/api/agent/sessions/:id`; messages loaded per session; conversation_id set from first response |
| Chat rename / organization | **Partial** | Rename: PATCH session name, success check `data.success \|\| data.id \|\| !data.error`; no reset on conversation_id (v=56). No folders/tags; delete single conversation implemented (DELETE session) |
| File context bridge | **Fully working** | `currentFileContext` state; `handleFileContextChange` from FloatingPreviewPanel; sent as `fileContext` in chat body; worker injects into system when user message references "this file" / "open file" / "current file" (first 15k chars) |
| Codebase search (AutoRAG / Vectorize) | **Fully working** | Knowledge search popover: `/api/agent/rag/query` + `/api/r2/search` per bucket; RAG context also injected server-side for chat (AISEARCH when query long enough) |
| Multi-turn with file edits | **Fully working** | Agent can emit code blocks; diff from chat (monacoDiffFromChat) → Keep Changes writes to R2; proposedFileChange for currently open file → diff in Monaco |
| Tool execution | **Fully working** | Tools from `mcp_registered_tools` (DB). Action tools require approval: stream `tool_approval_request` → UI card → POST `/api/agent/chat/execute-approved-tool` → invokeMcpToolFromChat. See "Tools registered" below. |

**Tools registered (worker):**  
- **Action (approval required):** `d1_write`, `r2_write`, `r2_delete`, `terminal_execute`, `worker_deploy`, `playwright_screenshot`, `browser_screenshot`, `browser_navigate`, `browser_content`  
- **Read-only (no approval):** `knowledge_search`, `d1_query`, `r2_read`, `r2_list`, `web_search`, `telemetry_query`  
Plus any MCP remote tools from `mcp_registered_tools`; category determines approval.

### Code Execution

| Feature | Status | Notes |
|--------|--------|--------|
| Browser preview panel | **Fully working** | FloatingPreviewPanel Browser tab; URL input; GET `/api/browser/screenshot?url=...` (Playwright); image display and "Capture" |
| Terminal integration (PTY) | **Fully working** | WebSocket `/api/agent/terminal/ws`; POST `/api/agent/terminal/run`; xterm.js in panel; register/resume session |
| Playwright integration | **Fully working** | Worker: `/api/browser/screenshot`, `/api/playwright/screenshot` (POST); MYBROWSER binding; jobs table for async screenshot |
| Test execution workflow | **Stubbed** | No dedicated test runner UI; terminal can run commands |

### Integrations

| Feature | Status | Notes |
|--------|--------|--------|
| GitHub | **Partial** | OAuth start/callback; `/api/integrations/github/repos`, `/api/integrations/github/files`, `/api/integrations/github/file` — list repos, list files, get file content. Used in Files tab to open a file in Monaco. No push/PR from dashboard |
| Google Drive | **Partial** | OAuth; `/api/integrations/gdrive/files`, `/api/integrations/gdrive/file` — list files, get file content. Open in Code tab. `/api/integrations/drive/list` returns 501 "not implemented yet" |
| MCP orchestration (4-panel) | **Stubbed** | `dashboard/mcp.html` exists (MCP & AI page, theme/shell); no 4-panel Architect/Builder/Tester/Operator UI wired in this codebase. Worker has `/api/mcp/*` (status, agents, tools, commands, dispatch, invoke) |

---

## 2. Architecture Overview

### File context: Monaco → Chat → AI

1. **Monaco (FloatingPreviewPanel):** On load/save/switch file, `onFileContextChange({ filename, content, bucket })` is called (and when opening from R2 list, GDrive, or GitHub).
2. **AgentDashboard:** `handleFileContextChange` sets `currentFileContext` state; same value is passed to chat POST as `fileContext`.
3. **Worker (`/api/agent/chat`):** Reads `body.fileContext` (filename, content, bucket). If present and last user message references file ("this file", "open file", "current file"), appends to system prompt: `Filename: …`, `Bucket: …`, `Content (first 15k chars): …`.

### Tool calls

1. **Streaming:** Worker (e.g. `chatWithToolsAnthropic`) runs tool loop; for action tools in "ask" mode (or when approval required), emits SSE `{ type: 'tool_approval_request', tool: { name, description, parameters, preview } }` then `done` without executing.
2. **Frontend:** On `tool_approval_request`, sets `pendingToolApproval`; shows card with Approve / Cancel.
3. **Approve:** POST `/api/agent/chat/execute-approved-tool` with `tool_name`, `tool_input`, `conversation_id`; worker calls `invokeMcpToolFromChat` (built-in or MCP remote), returns `{ success, result }`; frontend appends system message with result and clears pending.
4. **Built-in tools** (e.g. terminal_execute, r2_write) implemented in worker; others delegated to MCP via `/api/mcp/invoke` and `mcp_registered_tools`.

### R2 bucket structure (worker + dashboard)

- **agent-sam (DASHBOARD binding):** Dashboard static assets. Keys used:
  - `static/dashboard/agent.html`, `static/dashboard/agent/agent-dashboard.js`, `static/dashboard/agent/agent-dashboard.css`
  - `static/dashboard/pages/<name>` for shell #page-content fragments
  - `static/dashboard/glb-viewer.html`, etc.
- **agent-sam** (and other bound buckets) also used for R2 API: list, search, get object, put object, delete. So "Files" tab can list/edit files in agent-sam or other configured buckets.
- **iam-platform:** Referenced for memory/knowledge (e.g. `memory/daily/*.md`, `memory/schema-and-records.md`).
- **Bound bucket names** (R2 API): `inneranimalmedia-assets`, `splineicons`, `agent-sam`, `iam-platform`.

### How the worker serves/updates files

- **Dashboard HTML/JS/CSS:** Served from R2 (DASHBOARD = agent-sam). Route: path like `/static/dashboard/agent/agent-dashboard.js` → `env.DASHBOARD.get('static/dashboard/agent/agent-dashboard.js')` or similar; cache bust with `?v=56`.
- **File edits from dashboard:** Frontend PUT to `/api/r2/buckets/:bucket/object/:key` with request body; worker does `binding.put(key, body, { httpMetadata: { contentType } })`. No separate "source" copy for dashboard code — deploy flow copies worker to repo and deploys; dashboard assets uploaded to R2 (e.g. wrangler r2 object put) then worker serves from same bucket.

---

## 3. Known Gaps

- **Stubbed / not fully functional**
  - File creation: no "New file" in UI.
  - Test execution: no dedicated test runner; only terminal.
  - MCP 4-panel: mcp.html is a shell; no Architect/Builder/Tester/Operator panels implemented.
  - `/api/integrations/drive/list`: 501; list of Drive files not implemented (GDrive file get is).

- **Broken or brittle**
  - Chat rename on new conversations: fixed in v=56 (no longer reset sessionName when conversation_id is set); any remaining bugs are "still buggy" per TOMORROW (e.g. edge cases).
  - Monaco disposal: previously fixed (no manual setValue in useEffect); Keep Changes / Undo flow should be stable.

- **UI present, not wired**
  - "Delete conversation" is wired (DELETE session + clear local state). "Organize" (folders/tags) not implemented.
  - Queue indicator shows queue status; internal queues UI (show queued tasks in detail) is a roadmap item.
  - AnimatedStatusText exists; loading states during tool execution could be improved (roadmap).

---

## 4. Current State (v=56)

### Last 6 versions (v=51–56)

| Version | Change |
|---------|--------|
| v=51 | Mode/Model hide when `chatPaneIsWide` (panel open + narrow chat); chat rename success check `!data.error` instead of `data.ok` |
| v=52 | Context gauge mini donut (20px), stroke 2, center label 7px |
| v=53 | Gauge: empty donut; popover only; popover right-aligned |
| v=54 | Rename: added [Rename] console logs and alert (debug; later removed) |
| v=55 | Rename: success check `data.success \|\| data.id \|\| !data.error`; `setCurrentSessionId(data.id)` when present; system messages excluded from context gauge |
| v=56 | Rename: removed `setSessionName("New Conversation")` when setting conversation_id (streaming + non-streaming) so name is not wiped on first message |

### Session state not persisted

- **In-memory only (until reload):** Current open file (filename, content, bucket) in Monaco; `browserUrl` / preview HTML; terminal output buffer; `pendingToolApproval`; `monacoDiffFromChat`; `proposedFileChange`; UI state (panel width, active tab, connector/knowledge popover open, etc.). Session list and message history are loaded from API when `currentSessionId` is set or from URL `?session=`.
- **Persisted:** Sessions and messages in D1; session name/starred/project_id via PATCH; R2 file contents via PUT; theme in localStorage; panel width in localStorage (`iam_panel_width`).

### Logging / debugging

- **Worker:** `[agent/chat] model_id`, `[execute-approved-tool] tool_name/tool_input/result`, AISEARCH failures, MCP invoke warnings.
- **Frontend:** Removed [Rename] console logs and alert in v=55. No structured logging layer; ad hoc console.log in places (e.g. file context stored).
- **Session log:** `docs/cursor-session-log.md` and handoff `docs/TOMORROW.md` updated per session.

---

*End of technical inventory. For handoff and roadmap, see `docs/TOMORROW.md`.*
