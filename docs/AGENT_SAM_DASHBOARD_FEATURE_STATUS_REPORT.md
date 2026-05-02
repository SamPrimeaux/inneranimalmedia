# Agent Sam Dashboard — Comprehensive Feature Status Report

**Generated:** 2026-03-17  
**Scope:** All major feature areas; status per area with exact gaps for partial/stubbed items.

Legend:
- **Working end-to-end** — Feature is implemented and functional from UI through worker/API.
- **Partially working** — Some flows work; specific parts broken or missing (listed).
- **Stubbed** — UI or shell exists but not wired to real behavior (listed).
- **Not implemented** — No meaningful implementation.

Symbol key: Working end-to-end | Partially working | Stubbed | Not implemented  
(Equivalents: Working | Partial | Stubbed | Not implemented)

**Top-level status by area:**
1. File operations — Partially working (create stubbed, multi-file partial)
2. Monaco editor — Working end-to-end
3. Chat & AI — Partially working (tools off in streaming for non-Anthropic)
4. Tool execution — Partially working (same streaming gap)
5. Terminal — Partially working (no in-panel history)
6. Browser preview — Partially working (no in-panel navigate)
7. GitHub — Partially working (commit/push not implemented)
8. Google Drive — Working end-to-end
9. R2 file sync — Working end-to-end
10. Search — Working end-to-end
11. Execution plans — Partially working (WAITING_APPROVAL not emitted; execute stubbed)
12. MCP orchestration — Partially working (4-panel stubbed)

---

## 1. File operations (create, edit, delete, multi-file)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **Edit** | Working end-to-end | PUT `/api/r2/buckets/:bucket/object/:key`; Monaco save, "Keep Changes" from diff; dirty state and last-saved ref. |
| **Delete** | Partially working | Worker: `/api/r2/file` (DELETE body `{ bucket, key }`), `/api/r2/delete` (query params). Dashboard: delete button in FloatingPreviewPanel Files tab for R2 objects (`onDeleteFile` calls `/api/r2/file`). **Missing:** No delete in Code tab for current file; no confirmation dialog in some flows. |
| **Create** | Stubbed | **Missing:** No "New file" button or flow in UI. User can only save to an existing key by editing path (not exposed). R2 PUT supports writing to a new key; UI does not offer "Create new file" or "Save as". |
| **Multi-file** | Partially working | **Missing:** Only one file open in Code tab at a time. No multi-tab editor, no "open in new tab," no multi-file diff or batch operations. Single-file diff (chat → Monaco) works. |

**Summary:** Partially working — Edit and single-file delete work; create and multi-file are stubbed or partial.

---

## 2. Monaco editor (open, edit, save, diff view)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **Open** | Working end-to-end | Open from R2 list (Files tab), from GitHub file, from Google Drive file; GET object, set in Monaco with language from filename. |
| **Edit** | Working end-to-end | @monaco-editor/react; theme from `data-theme` (iam-custom); language from `getMonacoLanguage(filename)`. |
| **Save** | Working end-to-end | Save button writes to R2 via PUT; "Keep Changes" from diff (chat or proposed) writes to same or chosen key. |
| **Diff view** | Working end-to-end | DiffEditor in FloatingPreviewPanel; diff from chat (`monacoDiffFromChat`: original from R2, modified from generated code); "Open in Monaco" from message opens diff; "Keep Changes" / "Undo" resolve diff and optionally write to R2. |

**Summary:** Working end-to-end.

---

## 3. Chat & AI (streaming, non-streaming, context, model selection)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **Streaming** | Working end-to-end | SSE from `/api/agent/chat` when `body.stream === true`; events: `text`, `code`, `state`, `done`, `tool_approval_request`, `error`. OpenAI, Google, Workers AI, Anthropic (inline) stream token-by-token. |
| **Non-streaming** | Working end-to-end | When `body.stream !== true`, JSON response with `content`, `role`, `conversation_id`; used when tools are enabled (useTools = true). |
| **Context** | Working end-to-end | `fileContext` in body; worker injects current file (filename, bucket, first 15k chars) into system when user message references "this file" / "open file" / "current file". Context gauge (mini donut) and popover; estimated tokens from message length. |
| **Model selection** | Working end-to-end | Model picker loads from `/api/agent/models`; `model_id` in chat body; worker resolves provider and model_key. |
| **Tools when streaming** | Partially working | **Missing (P0):** When `wantStream === true`, worker sets `useTools = false` for OpenAI/Google/Workers AI, so no tool execution in streaming path. Anthropic with tools uses `chatWithToolsAnthropic(stream: true)` (non-streaming API, SSE wrapper) so tools + approval work there. Fix: add tool execution to streaming path (streamOpenAI, streamGoogle, etc.) or allow tools when streaming. |

**Summary:** Partially working — Chat, context, model selection work; tools are disabled in streaming for non-Anthropic providers.

---

## 4. Tool execution (approval, logging, all tool types)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **Approval flow** | Working end-to-end | SSE `tool_approval_request` → UI card (Approve / Cancel) → POST `/api/agent/chat/execute-approved-tool` → `invokeMcpToolFromChat`. Works in non-streaming tool loop and in Anthropic streaming (chatWithToolsAnthropic). |
| **Logging** | Working end-to-end | `mcp_tool_calls` INSERT in runToolLoop and recordMcpToolCall; audit_log for terminal_execute, d1_write, playwright_screenshot; agent_command_executions for terminal/run. |
| **Built-in tools** | Working end-to-end | terminal_execute, d1_query, d1_write, r2_read, r2_list, knowledge_search, generate_execution_plan, playwright_screenshot, browser_screenshot implemented in worker (runToolLoop + invokeMcpToolFromChat). |
| **MCP-registered tools** | Working end-to-end | Tools from `mcp_registered_tools` (enabled = 1) sent to model; unknown tools delegated to MCP via `/api/mcp/invoke`. |
| **All tool types in streaming** | Partially working | **Missing:** In streaming path (OpenAI/Google/Workers AI), tools are not requested (`useTools = false` when `wantStream`). So tool execution and approval do not run when user has streaming on and a non-Anthropic model. |

**Summary:** Partially working — Approval, logging, and all tool types work in non-streaming and Anthropic streaming; tools are disabled in other streaming paths.

---

## 5. Terminal (PTY connection, command execution, history)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **PTY connection** | Working end-to-end | WebSocket `/api/agent/terminal/ws`; worker proxies to upstream (TERMINAL_WS_URL) with auth; FloatingPreviewPanel connects when Terminal tab is active; xterm.js-style I/O (send line, display output). |
| **Command execution** | Working end-to-end | User types in terminal input, sends via WS; POST `/api/agent/terminal/run` with `command`, `session_id` runs command on PTY; "Run in terminal" from chat code block uses `/api/agent/commands/execute` or runCommandInTerminal. |
| **History** | Partially working | Worker writes to `terminal_history` (input + output) from runTerminalCommand and terminal/run. Hub page shows recent terminal activity from API. **Missing:** No in-panel command history (up/down to cycle previous commands) in the Agent dashboard terminal UI; history is stored but not exposed in the terminal tab. |

**Summary:** Partially working — PTY and execution work; in-dashboard command history (up/down) not implemented.

---

## 6. Browser preview (screenshots, navigation)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **Screenshots** | Working end-to-end | Browser tab: URL input; "Capture" calls POST `/api/playwright/screenshot` (job), polls `/api/playwright/jobs/:id`, displays `screenshot_url`. Worker: Playwright/MYBROWSER binding; runInternalPlaywrightTool for playwright_screenshot / browser_screenshot. |
| **Navigation** | Partially working | User can enter URL and open in new tab (window.open). **Missing:** No in-panel live navigation (iframe with same-origin or proxy); no "Navigate" button that loads URL inside the dashboard iframe. Live iframe exists in Browser tab but is used for display; navigation is open-in-new-tab only. |

**Summary:** Partially working — Screenshots and capture work; in-panel navigation (iframe load URL) not fully wired.

---

## 7. GitHub integration (OAuth, browse repos, open files, commit/push)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **OAuth** | Working end-to-end | Worker: GitHub OAuth start/callback; token stored in `user_oauth_tokens`. |
| **Browse repos** | Working end-to-end | GET `/api/integrations/github/repos`; listed in Files tab when source is `__github__`. |
| **Open files** | Working end-to-end | GET `/api/integrations/github/files` (repo, path); GET `/api/integrations/github/file` (content); GET `/api/integrations/github/raw` (proxy). Open in Code or View. |
| **Commit / push** | Not implemented | **Missing:** No UI or API for creating commits, pushing, or opening PRs from the dashboard. Worker has no `/api/integrations/github/commit` or push endpoints. |

**Summary:** Partially working — OAuth, browse, open files work; commit/push not implemented.

---

## 8. Google Drive integration (OAuth, browse files, open files)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **OAuth** | Working end-to-end | Worker: Google OAuth with drive scopes; token in `user_oauth_tokens`; refresh supported. |
| **Browse files** | Working end-to-end | GET `/api/integrations/gdrive/files?folderId=`; list folders and files; navigate with folder stack. |
| **Open files** | Working end-to-end | GET `/api/integrations/gdrive/file?fileId=` (content); GET `/api/integrations/gdrive/raw` (proxy). Open in Code or View. |
| **Drive list (legacy)** | Stubbed | **Missing:** `/api/integrations/drive/list` returns 501 "not implemented yet." GDrive file list is under `/api/integrations/gdrive/files` and works. |

**Summary:** Working end-to-end for OAuth, browse, open; legacy drive/list endpoint is stubbed.

---

## 9. R2 file sync (list, upload, download, sync workflow)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **List** | Working end-to-end | GET `/api/r2/list` (bucket, prefix, recursive); GET `/api/r2/buckets` for bucket list. Used in Files tab and Source Control. |
| **Upload** | Working end-to-end | POST `/api/r2/upload` (query bucket, key; body = file); PUT `/api/r2/buckets/:bucket/object/:key` (Monaco save). |
| **Download** | Working end-to-end | GET `/api/r2/buckets/:bucket/object/:key` returns object body; used for open-in-editor and View. |
| **Sync workflow** | Partially working | POST `/api/r2/sync` exists (worker). **Missing:** No dedicated "Sync" button or sync status in the Agent dashboard Files tab; R2 list is fetched on demand. Sync may be used elsewhere (e.g. bulk-action). |

**Summary:** Working end-to-end for list, upload, download; sync workflow is partial (no prominent sync UI in Agent dashboard).

---

## 10. Search (knowledge search, codebase search, file search)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **Knowledge search** | Working end-to-end | Tool `knowledge_search` in runToolLoop and invokeMcpToolFromChat; AutoRAG/Vectorize; chat bar search popover uses `/api/agent/rag/query` and `/api/r2/search` per bucket. |
| **Codebase search** | Working end-to-end | Same RAG/Vectorize + R2 search; injected into chat when query long enough (AISEARCH). |
| **File search** | Working end-to-end | GET `/api/r2/search?bucket=&q=` (prefix/key match); used in Source Control and search popover. |

**Summary:** Working end-to-end.

---

## 11. Execution plans (create, approve, execute)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **Create** | Working end-to-end | Tool `generate_execution_plan` inserts into `agent_execution_plans` (plan_json, summary, status = pending); returns plan_id to model. |
| **Approve** | Working end-to-end | POST `/api/agent/plan/approve` with plan_id; updates status to approved. POST `/api/agent/plan/reject`. Dashboard: ExecutionPlanCard with Approve / Reject. |
| **Show approval UI** | Partially working | Dashboard expects SSE `{ type: 'state', state: 'WAITING_APPROVAL', plan_id, summary, steps }` to set executionPlan and show card. **Missing:** Worker never emits `state: 'WAITING_APPROVAL'` with plan_id in any path. Plan is created via tool and plan_id is in assistant text; UI only shows approval card if it receives the SSE event. So approval card may not appear unless the frontend parses plan_id from message content or worker is updated to emit WAITING_APPROVAL after generate_execution_plan. |
| **Execute** | Stubbed | **Missing:** After approve, UI sets state to EXECUTING. Worker has `agent_request_queue` and processQueues (marks tasks done/failed) but no real execution of plan steps (e.g. running each step as tool/command). Plan approval updates DB only; no "run this plan" step execution. |

**Summary:** Partially working — Create and approve/reject APIs work; WAITING_APPROVAL SSE not emitted; execute is stubbed (no step runner).

---

## 12. MCP orchestration (4-panel page, tool registration)

| Sub-feature | Status | Notes |
|-------------|--------|--------|
| **4-panel page** | Stubbed | **Missing:** `dashboard/mcp.html` exists (theme, shell, nav). No Architect/Builder/Tester/Operator panels or MCP-specific workflow UI. |
| **Tool registration** | Working end-to-end | Tools in D1 `mcp_registered_tools` (tool_name, description, input_schema, enabled); loaded by worker for chat tool loop and for MCP invoke. Migrations and admin can insert/update. No dedicated "Register tool" UI in dashboard; registration is via DB/migrations. |

**Summary:** Partially working — Tool registration (backend) works; 4-panel MCP page is stubbed.

---

## Summary table

| # | Feature area | Status | Main gap(s) |
|---|----------------|--------|-------------|
| 1 | File operations | Partially working | Create: no "New file" UI. Multi-file: single file only; no multi-tab. |
| 2 | Monaco editor | Working end-to-end | — |
| 3 | Chat & AI | Partially working | Tools disabled in streaming for OpenAI/Google/Workers AI (P0). |
| 4 | Tool execution | Partially working | Same as 3: no tools in non-Anthropic streaming path. |
| 5 | Terminal | Partially working | No in-panel command history (up/down). |
| 6 | Browser preview | Partially working | No in-panel navigate (iframe load URL). |
| 7 | GitHub | Partially working | Commit/push not implemented. |
| 8 | Google Drive | Working end-to-end | Legacy drive/list 501 only. |
| 9 | R2 file sync | Working end-to-end | Sync workflow has no prominent sync UI in Agent. |
| 10 | Search | Working end-to-end | — |
| 11 | Execution plans | Partially working | WAITING_APPROVAL SSE not emitted; execute (step runner) stubbed. |
| 12 | MCP orchestration | Partially working | 4-panel page stubbed; tool registration is backend-only. |

### Quick-scan by symbol

| Symbol | Count | Areas |
|--------|-------|--------|
| Working end-to-end | 4 | Monaco editor, Google Drive, R2 file sync, Search |
| Partially working | 8 | File operations, Chat & AI, Tool execution, Terminal, Browser preview, GitHub, Execution plans, MCP orchestration |
| Stubbed | 0 (as primary) | Create file (within File ops); Execute plan steps (within Execution plans); 4-panel (within MCP) |
| Not implemented | 0 (as primary) | Commit/push (within GitHub) |

---

*End of feature status report. For technical inventory and handoff, see `docs/AGENT_SAM_DASHBOARD_TECHNICAL_INVENTORY.md` and `docs/TOMORROW.md`.*
