# Agent Sam — Capabilities and Tracking Audit (Evidence-Based)

**Date:** 2026-03-17  
**Scope:** worker.js, agent-dashboard (React), D1 cost/telemetry/tools. Evidence only; line numbers and grep results included.

---

## 1. COST TRACKING AUDIT

### 1.1 Grep: where costs are written

```bash
grep -n "INSERT INTO agent_costs\|INSERT INTO agent_telemetry\|INSERT INTO spend_ledger" worker.js
```

**Results:**

| Line | Table | Trigger / context |
|------|--------|--------------------|
| 1183 | agent_telemetry | `streamDoneDbWrites()` — called after a **streamed** chat completion (agent_messages + telemetry + spend_ledger) |
| 1189 | spend_ledger | Same; `streamDoneDbWrites()` (sync or waitUntil) |
| 1679 | agent_costs | **runToolLoop** only — after tool loop finishes (classification + LLM + tools); **not** on plain chat |
| 3546 | agent_telemetry | **/api/agent/chat** stream path — after Anthropic stream chunk loop, in `streamDoneDbWrites`-like inline block |
| 3555, 3562 | spend_ledger | Same stream path (waitUntil + fallback sync) |
| 3772 | agent_telemetry | **/api/agent/chat** non-stream path — after single LLM response (e.g. OpenAI/Google/Anthropic non-stream, gateway, Workers AI) |
| 3781, 3788 | spend_ledger | Same non-stream path |

### 1.2 What triggers each INSERT

- **agent_telemetry:** Written when a **chat completion** finishes (stream or non-stream). Trigger: every successful `/api/agent/chat` response (streaming or not). Columns used: `metric_type: 'llm_call'`, `metric_name: 'chat_completion'`, `input_tokens`, `output_tokens`, `computed_cost_usd` (and id, tenant_id, session_id, model_used, provider, timestamp, created_at).
- **spend_ledger:** Same as agent_telemetry — every chat completion. Used for $ gauge and finance APIs (`GET /api/finance/ai-spend`, overview stats). Written in same blocks as agent_telemetry (1164–1197, 3546–3566, 3772–3791).
- **agent_costs:** Written **only** in **runToolLoop** (lines 1675–1682). Trigger: **tool-use path** of `/api/agent/chat` (when `useTools && toolDefinitions.length > 0` and model is Anthropic/OpenAI/Google). After the loop, it inserts one row per tool-loop run with `task_type` from intent classification (`classification?.intent ?? 'tool_loop'`). **Plain chat (no tools) does not write to agent_costs.**

### 1.3 Difference between the three tables

| Table | Purpose | When written | Used by |
|-------|--------|--------------|---------|
| **agent_telemetry** | Token counts and call count per LLM call | Every chat completion (stream + non-stream) | GET /api/agent/telemetry, overview/stats, 7-day totals |
| **spend_ledger** | Dollar amounts for billing / $ gauge | Every chat completion (same as telemetry) | Finance APIs, overview spend, agent $ gauge |
| **agent_costs** | Cost per **tool-loop** run (one row per tool run) | Only when **runToolLoop** is used (tool path) | D1 reporting; not used by streaming path or non-tool chat |

### 1.4 /api/agent/chat handler (approx. 3400–3800): which tables are written?

- **agent_costs:** **NO** in the handler itself. The handler calls `runToolLoop` (3638); **runToolLoop** does the INSERT (1679). So effectively **yes** for the tool path only, and **no** for stream-only or no-tool paths.
- **agent_telemetry:** **YES** — stream path ~3546 (inline after Anthropic stream), non-stream path ~3772.
- **spend_ledger:** **YES** — stream path ~3555, 3562; non-stream path ~3781, 3788.

**Evidence (worker.js):**

- `agent_costs`: only at 1679 (inside runToolLoop).
- `agent_telemetry`: 1183 (streamDoneDbWrites), 3546 (stream), 3772 (non-stream).
- `spend_ledger`: 1189, 3555, 3562, 3781, 3788.

---

## 2. PLAYWRIGHT VERIFICATION

### 2.1 Grep

```bash
grep -n "playwright\|browser.*screenshot\|browser.*navigate\|MYBROWSER" worker.js
```

**Relevant lines (summary):**

- 5, 10–11: Comment and dynamic import for Playwright; `playwrightLaunch` global.
- 215, 527, 577: Routing — `/api/agent`, `/api/terminal`, `/api/playwright` grouped.
- 916–940: Queue-based Playwright job (jobId, MYBROWSER, DASHBOARD, DB); updates `playwright_jobs`.
- 986–1050: **handlePlaywright** — health/metrics and **GET /api/browser/screenshot** (url param, optional KV cache, then Playwright screenshot).
- 998: **GET /api/browser/screenshot** — returns image (jpeg); caches in KV.
- 1046–1050: Other browser usage in same block.
- 1063–1064, 1079: Response shape `browser: 'playwright'`, `binding: 'MYBROWSER'`.
- 1630–1632: **runToolLoop** — if tool is `playwright_screenshot` or `browser_screenshot` and MYBROWSER + DASHBOARD, calls `runInternalPlaywrightTool`.
- 1640: BUILTIN_TOOLS set includes `playwright_screenshot`, `browser_screenshot`.
- 3008–3061: **GET /api/agent/playwright/:id** (job status), **GET /api/playwright/jobs/:id** (job by id), **POST /api/playwright/screenshot** (insert job, optional queue).
- 3022: **POST /api/playwright/screenshot** — inserts into `playwright_jobs`, then queue or inline run.
- 3038–3061: Inline Playwright run (launch, goto, screenshot, R2 put, update job).
- 3312: System prompt: Playwright/browser tools listed (playwright_screenshot, browser_screenshot, browser_navigate, browser_content).
- 3802–3814: **POST /api/agent/playwright** — create job (playwright_jobs), return jobId; optional MY_QUEUE.send.
- 4358–4366: **POST /api/mcp/invoke** — INTERNAL_PLAYWRIGHT_TOOLS = playwright_screenshot, browser_screenshot, browser_navigate, browser_content; run in worker, write mcp_tool_calls.
- 4476–4479: **invokeMcpToolFromChat** — same INTERNAL_PLAYWRIGHT_TOOLS, calls runInternalPlaywrightTool, recordMcpToolCall.
- 4717–4745: **runInternalPlaywrightTool(env, toolName, params)** — launch, goto; browser_navigate → { ok, url }; browser_content → { ok, url, html }; playwright_screenshot / browser_screenshot → R2 put, return { ok, screenshot_url, job_id }.
- 4752: List of tools including playwright_screenshot, browser_screenshot, browser_navigate, browser_content.
- 6979–7051, 7044–7051: More Playwright usage (screenshots, launch).

### 2.2 Is there a /api/agent/playwright endpoint?

**YES.**  
- **POST /api/agent/playwright** (3802–3814): Creates a row in `playwright_jobs` (id, job_type, url, status='pending', metadata), optionally sends to MY_QUEUE, returns `{ jobId, status: 'pending' }`.  
- **GET /api/agent/playwright/:id** (3008–3010): Returns job by id from `playwright_jobs`.  
- **GET /api/playwright/jobs/:id** (3014–3021): Returns job from `playwright_jobs_v2` or `playwright_jobs`.  
- **POST /api/playwright/screenshot** (3022–3061): Creates job and runs Playwright (or queue).

### 2.3 Is Playwright registered as a tool the agent can call?

**Partially.**

- **Chat tool loop (runToolLoop):** Tool definitions come from **mcp_registered_tools** (3377–3403). Migration **131_playwright_tools.sql** inserts **playwright_screenshot** and **browser_screenshot** into mcp_registered_tools. So the **agent can call** these two in chat when tools are enabled.
- **runToolLoop** only implements **playwright_screenshot** and **browser_screenshot** (1630–1638). It does **not** implement **browser_navigate** or **browser_content** in the loop.
- **browser_navigate** and **browser_content** are in INTERNAL_PLAYWRIGHT_TOOLS and are run via **invokeMcpToolFromChat** and **POST /api/mcp/invoke** (4359, 4476), but they are **not** in migration 131, so they are **not** in mcp_registered_tools and **not** in the tool list sent to the model in the chat tool loop. So in chat, the model only has **playwright_screenshot** and **browser_screenshot**.

### 2.4 What does Playwright do?

- **playwright_screenshot / browser_screenshot:** Navigate to url, take PNG screenshot, upload to R2 (DASHBOARD bucket, key `screenshots/<uuid>.png`), return `{ ok, screenshot_url, job_id }` (4734–4740).  
- **browser_navigate:** Goto url, return `{ ok, url }` (4727–4728).  
- **browser_content:** Goto url, return `{ ok, url, html }` (first 500k chars) (4730–4732).  
- **GET /api/browser/screenshot:** Standalone HTTP endpoint; url in query; returns jpeg (and caches in KV).  
- **POST /api/playwright/screenshot** / **POST /api/agent/playwright:** Job-based screenshot (create job, run or queue, poll via /api/playwright/jobs/:id).

### 2.5 Tool definition (from migration 131)

**playwright_screenshot:**  
- tool_name: `playwright_screenshot`, category: `browser`, mcp_service_url: `BUILTIN`.  
- description: "Capture screenshot of a webpage using Playwright".  
- input_schema: `{"url": "string (required)", "selector": "string (optional CSS selector)", "fullPage": "boolean (optional, default false)"}`.

**browser_screenshot:**  
- tool_name: `browser_screenshot`, category: `browser`, mcp_service_url: `BUILTIN`.  
- description: "Capture screenshot via browser rendering (faster, cached)".  
- input_schema: `{"url": "string (required)"}`.

---

## 3. TOOL REGISTRATION AUDIT

### 3.1 Grep

```bash
grep -n "toolDefinitions\|tools.*=.*\[\|registerTool" worker.js
```

**Results:**

- 1386: `runToolLoop(..., toolDefinitions, ...)`  
- 1393: log toolDefinitions.length  
- 1441, 1456, 1480: toolDefinitions passed to Anthropic / OpenAI / Google request bodies  
- 3377: `let toolDefinitions = [];`  
- 3378–3403: if useTools, load from D1: `SELECT tool_name, description, input_schema FROM mcp_registered_tools WHERE enabled = 1`; map to `{ name, description, input_schema }`  
- 3600–3601: log; if useTools && toolDefinitions.length > 0, call runToolLoop  
- 3638: `runToolLoop(..., toolDefinitions, ...)`  
- 4269, 4774: other `tools = []` (different context)

So **tools are not hardcoded in the handler;** they come from **mcp_registered_tools** (enabled = 1). The list below is from **migrations** and **runToolLoop** builtin handlers.

### 3.2 Every tool available to the agent (from code + migrations)

| Tool name | What it does | Where defined / handled |
|-----------|--------------|--------------------------|
| terminal_execute | Run command via PTY WebSocket (runTerminalCommand) | runToolLoop 1543–1552; BUILTIN |
| d1_query | Run SELECT only; env.DB.prepare(sql).all() | runToolLoop 1563–1575; BUILTIN |
| d1_write | Run non-DROP/TRUNCATE SQL; audit log | runToolLoop 1576–1592; BUILTIN |
| r2_read | Get object text by key/path | runToolLoop 1593–1599; BUILTIN |
| r2_list | List objects with prefix, limit 50 | runToolLoop 1600–1608; BUILTIN |
| knowledge_search | env.AI.autorag('inneranimalmedia-aisearch').search() | runToolLoop 1609–1629; migration 126; BUILTIN |
| generate_execution_plan | Insert agent_execution_plans row; return plan_id | runToolLoop 1619–1631; migration 130; BUILTIN |
| playwright_screenshot | Playwright screenshot, R2 upload, return screenshot_url | runToolLoop 1630–1637; migration 131; BUILTIN |
| browser_screenshot | Same as above | runToolLoop 1630–1637; migration 131; BUILTIN |

**Other tools in MCP / invoke path but not in mcp_registered_tools for chat:**

- browser_navigate, browser_content: implemented in runInternalPlaywrightTool and in INTERNAL_PLAYWRIGHT_TOOLS for /api/mcp/invoke and invokeMcpToolFromChat; **not** in migration 131, so **not** in the chat tool list.

**Any other tool** with enabled=1 in mcp_registered_tools is sent to the model; if the model calls it and it’s not in BUILTIN_TOOLS, the worker tries MCP (1641+). So **r2_search**, **r2_write**, **r2_bucket_summary**, **get_worker_services**, **human_context_list**, **platform_info**, etc., come from **mcp_registered_tools** (and possibly other migrations), not from a single hardcoded list in worker.js.

**Evidence (mcp_tool_calls query):** d1_query, r2_list, r2_read, r2_search, terminal_execute, knowledge_search, get_worker_services, r2_bucket_summary, human_context_list, r2_write, platform_info — all consistent with tools coming from mcp_registered_tools + builtin handlers.

---

## 4. FEATURE COMPLETENESS CHECK

### a) Browser preview integration

**worker.js:**

```bash
grep -n "browser.*preview\|preview.*url" worker.js
```

- 3305: System prompt: "OPEN_IN_PREVIEW: <full URL>" — agent is instructed to output this so "the dashboard will open that URL in the preview panel".

**agent-dashboard:**  
- No grep hit for "OPEN_IN_PREVIEW" in agent-dashboard src.  
- Stream handler (AgentDashboard.jsx 1029–1035): on `data.type === "text"` it only appends `data.text` to content; it does **not** parse "OPEN_IN_PREVIEW: <url>" or call setBrowserUrl.  
- FloatingPreviewPanel has Browser tab with iframe (browserUrl), Go, Screenshot; browserUrl is passed as prop and onBrowserUrlChange is setBrowserUrl (2971). So the **UI can show** a URL in the preview, but **nothing in the stream sets that URL** from agent output.

**Verdict:** **NO** — Worker tells the agent to emit OPEN_IN_PREVIEW, but the dashboard does **not** parse it or set the preview URL. Browser preview is manual (user pastes URL) only.

### b) File diff / Keep Changes flow

**worker.js:**

```bash
grep -n "monacoDiffFromChat\|Keep Changes" worker.js
```

- No matches. Worker does not reference monacoDiffFromChat or "Keep Changes".

**agent-dashboard:**  
- FloatingPreviewPanel.jsx 106, 525–549, 1212, 1219, 1305–1313: monacoDiffFromChat prop; "Keep Changes" button; diff view (original/modified); on save, R2 PUT and onMonacoDiffResolved().  
- AgentDashboard.jsx 235, 1215–1241, 2066, 2078, 2979: monacoDiffFromChat state; openInMonaco(message) sets it from message.generatedCode, filename, bucket, language; "Open in Monaco" button on messages that have generatedCode.  
- Stream handler (1015–1028): **only** when `data.type === "code"` does it set generatedCode, filename, language on the message.  
- worker.js: **no** SSE event with `type: 'code'` or `type: "code"` is sent (only type: 'text', 'done', 'error', 'state' found at 1811, 1822, 3527, 3514, 3573, etc.). So the worker **never** sends structured code blocks for the dashboard to turn into "Open in Monaco".

**Verdict:** **NO** — Diff view and "Keep Changes" exist in React, but the worker does **not** send `type: "code"` events, so the "Open in Monaco" flow is never fed from the stream. It would only work if the worker started emitting code events.

### c) GitHub integration

**worker.js:**

```bash
grep -n "github.*api\|octokit" worker.js
```

- 392: Comment "Integrations (status, gdrive, github)".  
- 4020: "GitHub file list not implemented yet. OAuth tokens must be stored after Connect GitHub; then list repos/files via GitHub API." (501).  
- 5168: OAuth routes listed.  
- No octokit or GitHub API calls in worker.

**Verdict:** **Partial** — OAuth and route placeholders exist; file list / GitHub API not implemented (returns 501).

### d) Google Drive integration

**worker.js:**

```bash
grep -n "gdrive\|drive.*api" worker.js
```

- 392, 409–410, 447, 514: /api/integrations/gdrive/files, /api/integrations/gdrive/file, /api/integrations/gdrive/raw.  
- 4017, 4023, 4034: gdrive files/file endpoints; "Drive file list not implemented yet" (501) in one path; other paths may implement.  
- 5170: GET /api/integrations/gdrive/files listed.  
- 7284: Google OAuth scope includes drive.readonly, drive.file.

**Verdict:** **Partial** — OAuth and integration routes exist; some "not implemented" 501 responses; Drive API usage is partial (need to check 4023/4034 for actual implementation).

---

## 5. MISSING WIRING

| Feature | React | Worker | Connected? | Evidence |
|---------|--------|--------|------------|----------|
| Monaco diff view | Yes (FloatingPreviewPanel diff UI, "Keep Changes", save to R2) | No | **No** | Worker never sends `type: "code"` in SSE; only type text/done/error/state. React sets generatedCode only on data.type === "code" (AgentDashboard 1015–1028). |
| Terminal | Yes (FloatingPreviewPanel terminal tab) | Yes (runTerminalCommand, /api/terminal/*) | **Yes** | terminal_execute in runToolLoop; UI uses terminal session. |
| Browser preview (iframe) | Yes (Browser tab, iframe, Go, Screenshot) | Instructs agent: OPEN_IN_PREVIEW | **No** | No parsing of OPEN_IN_PREVIEW in agent-dashboard; setBrowserUrl never called from stream. |
| Playwright (screenshot) | Yes (Screenshot button calls /api/playwright/screenshot, polling /api/playwright/jobs/:id) | Yes (GET /api/browser/screenshot, POST /api/playwright/screenshot, POST /api/agent/playwright, runInternalPlaywrightTool) | **Yes** | Worker serves endpoints; React calls them; migration 131 registers tools for chat. |
| Playwright (agent tool) | N/A (agent chooses tool) | Yes (playwright_screenshot, browser_screenshot in runToolLoop + mcp_registered_tools) | **Yes** | Tools in D1; runToolLoop runs them. browser_navigate/browser_content not in chat tool list. |

**Summary:**  
- **Monaco diff / Open in Monaco:** Built in React; worker does not send code events → **not connected**.  
- **Browser preview (open URL from agent):** Prompt says OPEN_IN_PREVIEW; dashboard does not parse it → **not connected**.  
- **Terminal and Playwright:** Connected; evidence in runToolLoop, endpoints, and migrations.

---

## 6. Grep reference (exact commands and locations)

- Cost writes: `grep -n "INSERT INTO agent_costs\|INSERT INTO agent_telemetry\|INSERT INTO spend_ledger" worker.js` → lines 1183, 1189, 1679, 3546, 3555, 3562, 3772, 3781, 3788.  
- agent_costs/agent_telemetry/spend_ledger in chat: same file, sections 3400–3800 and 1164–1197, 1675–1682.  
- Playwright/browser: `grep -n "playwright\|browser.*screenshot\|browser.*navigate\|MYBROWSER" worker.js` → as in section 2.  
- Tool registration: `grep -n "toolDefinitions\|tools\s*=\s*\[" worker.js` → 3377, 3383, 3600, 3638, etc.  
- Browser preview: `grep -n "browser.*preview\|preview.*url" worker.js` → 3305 (prompt).  
- Diff/Keep Changes: `grep -n "monacoDiffFromChat\|Keep Changes" worker.js` → no matches.  
- GitHub: `grep -n "github.*api\|octokit" worker.js` → 392, 4020, 5168.  
- GDrive: `grep -n "gdrive\|drive.*api" worker.js` → 392, 409, 447, 514, 4017, 4023, 4034, 5170, 7284.

End of audit.
