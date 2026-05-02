# Agent Sam: Comprehensive Audit & Roadmap (Cursor Replacement)

**Generated:** 2026-03-17  
**Goal:** Make Agent Sam fully functional as a Cursor replacement.

---

## What's Working (P0 Complete as of 2026-03-17)

- Tool approval mechanism (Ask mode + Approve & Execute)
- MCP server with `r2_write` implementation (mcp-server/src/index.js; worker invokes via `invokeMcpToolFromChat` for builtins, MCP for r2_write)
- File auto-open in Monaco after creation (AgentDashboard.jsx ~1216, 1243, 2097; FloatingPreviewPanel.jsx ~420)
- Terminal via WebSocket (fully functional)
- Deploy script fixed (scripts/deploy-with-record.sh: only agent-dashboard.js, agent-dashboard.css, agent.html)
- File context auto-inject (worker.js ~3382-3397: always inject when bodyFileContext.filename + content present)
- Non-streaming mode with all providers and full tool loop (runToolLoop)

---

## 1. Streaming + Tools (P0 Remaining)

### Current state: Broken

- **worker.js 3405-3408:** `wantStream = body.stream === true && (canStream...)`; `useTools = supportsTools && !wantStream`. So when the client requests streaming, tools are disabled for all providers.
- **worker.js 3482-3530:** When `wantStream` is true:
  - OpenAI / Google / Workers AI: plain streaming only (streamOpenAI, streamGoogle, streamWorkersAI) — no tool_use handling.
  - Anthropic: `chatWithToolsAnthropic(env, ..., { stream: wantStream })` is called (3498), but **chatWithToolsAnthropic** (4809+) does **not** pass `stream: true` to the Claude API; it uses a single blocking request and tool loop. So even Anthropic does not stream tokens while using tools.

### What needs to happen

- Implement true streaming + tools: stream first response; on `tool_use` blocks, pause stream, run tools, append tool results, stream next turn (repeat until no more tool_use). Required for at least Anthropic first, then OpenAI (OpenAI supports streaming + tool_calls in one response or follow-up).
- Document the architecture (streaming SSE contract, tool_use handling, approval flow when streaming).

### Files / functions to modify

- **worker.js**
  - ~3405-3410: Keep `useTools` but add a path like `wantStreamAndTools` for Anthropic (and later OpenAI) that uses streaming tool loop.
  - ~3480-3532: For Anthropic when `wantStream`, call a new `streamChatWithToolsAnthropic` that uses Claude API with `stream: true`, parses SSE for content_block_delta and tool_use, runs tools, sends follow-up with tool results, streams again.
  - New function: `streamChatWithToolsAnthropic(env, systemWithBlurb, apiMessages, model, conversationId, agent_id, ctx)` — similar to chatWithToolsAnthropic but with stream body and SSE parsing; on tool_use, invoke tools (with approval if required), then next request with messages + tool results, stream again.
- **docs/STREAMING_TOOLS_ARCHITECTURE.md** (new): Pseudocode, SSE event types, tool_use handling, approval flow.

### Estimated time

4-6 hours (Anthropic first; OpenAI/Google optional follow-up).

### Dependencies

None (blocking Cursor replacement).

### Can Cursor implement it?

Yes (backend + optional frontend to show "Tool: r2_write" in stream).

---

## 2. AI Search / AutoRAG / Knowledge Search (P1 Critical)

### Current architecture

| Component | Location | Behavior |
|-----------|----------|----------|
| **Pre-inject RAG (chat)** | worker.js 3232-3245 | Only when `lastUserContent.split(' ').length > 10`. Calls `env.AI.autorag('inneranimalmedia-aisearch').search({ query: lastUserContent })`. Results flattened into `ragContext` and prepended to system as "Relevant platform context". |
| **Vectorize index population** | worker.js 5444-5518 `indexMemoryMarkdownToVectorize(env)` | Lists R2 keys under `memory/daily/`, `memory/compacted-chats/`, `knowledge/`, `docs/`; plus `memory/schema-and-records.md`, `memory/today-todo.md`. Chunks markdown, embeds with `@cf/baai/bge-large-en-v1.5`, upserts to **env.VECTORIZE**. Does **not** index worker.js, agent-dashboard/, or any codebase paths. |
| **AI Search (AutoRAG)** | Cloudflare AI Search index name: `inneranimalmedia-aisearch` | Same embedding model (1024 dims, cosine). Populated by: (1) Vectorize sync (if AI Search is bound to same Vectorize), or (2) separate indexing. What is actually in the index is determined by what was indexed — see below. |
| **knowledge_search tool** | worker.js 4521-4595 `invokeMcpToolFromChat` | Calls `env.AI.autorag('inneranimalmedia-aisearch').search({ query, max_num_results: 5 })`. If 0 results, fallback: embed query with RAG_MEMORY_EMBED_MODEL, `env.VECTORIZE.query(vector, { topK: 5 })`, then fetch full text from R2 by metadata.source. |

### Root cause: why code search fails

- **What is indexed**
  - **Vectorize (and thus AI Search if tied to same index):** Only R2 keys under `memory/daily/`, `memory/compacted-chats/`, `knowledge/`, `docs/`, plus `memory/schema-and-records.md`, `memory/today-todo.md` (worker.js 5446-5459). So: markdown docs and daily memory only — **no worker.js, no agent-dashboard source, no code**.
  - **ai_knowledge_base (D1):** Indexed via `/api/admin/vectorize-kb` (worker.js 335-388) into Vectorize (same index). Content comes from D1 table `ai_knowledge_base` (user-uploaded docs), not from repo files.

- **Why 1-2+ min for codebase questions**
  - First LLM call has no code context (RAG returns memory/docs only).
  - Model may call `knowledge_search` tool; tool returns no or weak code results; second LLM round. So two round-trips and no sub-second code retrieval.

### What needs to happen

1. **Index the codebase into Vectorize**
   - Add a job or cron that reads from R2 (or a build step that uploads source) for paths like `source/worker-source.js`, or from repo: `worker.js`, `agent-dashboard/src/**/*.jsx`, `mcp-server/src/index.js`, etc. Chunk by file or by function/block; embed with same model; upsert to Vectorize with metadata `{ source: path, kind: 'code' }`.
   - R2 paths to consider: if code is in R2, e.g. `agent-sam/source/worker-source.js`; or add a new prefix like `codebase/worker.js`, `codebase/agent-dashboard/src/AgentDashboard.jsx`.

2. **Pre-inject RAG before first LLM call**
   - Today RAG is only injected when user message has >10 words (worker.js 3233). Change to always run a single RAG query (e.g. lastUserContent or a short summary) and inject top-N results into system prompt so the first reply has context — no tool round-trip for basic search.

3. **Use direct Vectorize when appropriate**
   - For latency-sensitive path, query Vectorize directly (embed query → vectorize.query) instead of going through AutoRAG if AutoRAG adds latency. Keep AutoRAG for richer answer generation if needed elsewhere.

4. **Cache queries by hash**
   - Cache RAG results keyed by `hash(query)` (and maybe tenant) with short TTL to avoid repeated embed + query for same question.

### D1 queries to check state

```sql
-- List enabled tools (for tool audit)
SELECT tool_name, tool_category, requires_approval FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name;

-- Recent RAG search history (if table exists)
SELECT query_text, created_at FROM ai_rag_search_history ORDER BY created_at DESC LIMIT 10;
```

### worker.js line numbers (changes)

- **3232-3245:** Pre-inject RAG — remove `lastUserContent.split(' ').length > 10` guard; optionally add query-hash cache.
- **5444-5518:** `indexMemoryMarkdownToVectorize` — add new function or extend to also index codebase paths (R2 list prefix e.g. `codebase/` or read from repo build output). New R2 paths: e.g. `codebase/worker.js`, `codebase/agent-dashboard/src/AgentDashboard.jsx`.

### R2 paths

- **Current indexing (memory/docs only):** `memory/daily/`, `memory/compacted-chats/`, `knowledge/`, `docs/`, `memory/schema-and-records.md`, `memory/today-todo.md`.
- **To add for code:** e.g. `codebase/worker.js`, `codebase/agent-dashboard/src/**` (or equivalent); or use existing `agent-sam/source/worker-source.js` and add `agent-sam/static/dashboard/agent/` if you serve source maps/content there.

### Quick wins

- Always run pre-inject RAG (remove 10-word check) so every turn gets at least one search (worker.js 3233).
- Add codebase to Vectorize: one-time script or cron that uploads chunked worker.js + key agent-dashboard files to R2 under a prefix and runs existing chunk+embed+upsert logic for that prefix.

### Long-term optimal

- Separate index for code (or metadata filter) so code search doesn’t dilute doc search. Pre-inject code RAG only when query looks like code (e.g. "where is X defined", "function Y", file paths). Cache by query hash. Sub-second code results before first LLM call.

### Estimated time

- Pre-inject always + cache: 1-2 h. Codebase indexing: 2-4 h. Direct Vectorize + tuning: 2-3 h.

### Can Cursor implement it?

Yes.

---

## 3. Tool Testing & Implementation Status

### Current state

- **Worker:** Tools are loaded from D1 `mcp_registered_tools` (worker.js 3411-3434, 4813-4833). Builtin tools are handled inside `invokeMcpToolFromChat` and `runToolLoop`; others are sent to MCP server (`https://mcp.inneranimalmedia.com/mcp`).
- **Builtin (worker, no MCP):** knowledge_search (4521-4595), terminal_execute (4597-4614), d1_query (4615+), d1_write (stub/restricted in runToolLoop), r2_read (1581), r2_list (1589), Playwright (4754-4784 if MYBROWSER + DASHBOARD).
- **MCP (mcp-server):** r2_write (implemented), r2_read, r2_list, d1_query, d1_write, terminal_execute (proxies to terminal service), knowledge_search (stub string in MCP; actual implementation in worker when invoked from chat).
- **r2_write:** Confirmed working (MCP implements it; worker forwards to MCP for r2_write). Auto-open in Monaco after r2_write is implemented in dashboard.

### What to test

- **d1_query:** Worker runToolLoop allows SELECT only (1551-1555); invokeMcpToolFromChat d1_query (4616+) — same. Test: "List last 5 agent_messages."
- **d1_write:** runToolLoop has DDL restriction and approval; MCP allows arbitrary SQL. Test with non-DDL INSERT/UPDATE.
- **terminal_execute:** Worker calls runTerminalCommand (1687+); MCP proxies to terminal service. Test: "Run ls -la."
- **knowledge_search:** Worker builtin uses AutoRAG + Vectorize fallback. Test: "What is the deploy process?" (should return memory/docs).
- **r2_read / r2_list:** Implemented in worker runToolLoop and MCP. Test from chat.
- **Playwright (playwright_screenshot, browser_screenshot):** Require env.MYBROWSER and env.DASHBOARD (worker 4756-4784). Test only if bindings are set.

### D1 query to list tools

```sql
SELECT tool_name, tool_category, requires_approval, mcp_service_url FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name;
```

### Recommendation

- Add a small "Tool status" section in dashboard or run a script that invokes each tool with a safe test payload and records success/failure. Document which tools are builtin vs MCP and which need approval.

### Estimated time

2-3 hours to test and document all tools.

### Can Cursor implement it?

Yes.

---

## 4. Monaco Editor Integration

### Current state

- **Single file open:** Working. FloatingPreviewPanel shows one file (selectedFileForView); AgentDashboard passes file context (bodyFileContext) to chat and openInMonaco after r2_write.
- **Auto-open after r2_write:** Working (AgentDashboard.jsx ~1216, 1243, 2097).
- **Multi-file editing:** Unknown. UI appears single-file (one Monaco instance per preview key). No tabs or multi-file state in FloatingPreviewPanel found in audit.
- **File save workflow:** User saves from Monaco "Keep Changes"; PUT to R2 from dashboard; no agent-driven multi-file save flow documented.
- **Diff view:** Unknown; possible in Monaco but not confirmed in codebase.

### What needs to happen

- Confirm multi-file: either add tabs (multiple open files) or document "single file only" and add "Open in new tab" or second panel later.
- Test save flow end-to-end: edit in Monaco → Keep Changes → R2 updated → no disposal errors (already addressed in earlier session).
- Optionally: diff view for "before/after" from agent edits.

### Files

- agent-dashboard/src/FloatingPreviewPanel.jsx (single file, activeFile, renderViewPanel).
- agent-dashboard/src/AgentDashboard.jsx (openInMonaco, fileContext, tool success handling).

### Estimated time

2-4 hours (test + optional multi-tab or diff).

### Can Cursor implement it?

Partially (Cursor has multi-file and diff; we’d add as needed).

---

## 5. MCP Orchestration (4-panel system)

### Current state

- **Tables:** mcp_agent_sessions, mcp_command_suggestions, agent_intent_patterns (121). Seeds reference agents: mcp_agent_architect, mcp_agent_builder, mcp_agent_tester, mcp_agent_operator.
- **Worker:** GET /api/mcp/agents can return agents with sessions (worker.save 2410-2422 shows a query joining agent_ai_sam and mcp_agent_sessions for these four agents). Current worker.js may have different route; no full orchestration (dispatch to specific agent, then stream to panel) found.
- **Dashboard:** mcp.html has Tools/Session/Cost sections and a toast; no clear 4-panel Architect/Builder/Tester/Operator UI in the files audited.

### What needs to happen

- Confirm GET /api/mcp/agents and POST /api/mcp/dispatch (if any) in worker.js; implement or document intent routing (e.g. from agent_intent_patterns) to one of the four agents. Then have the agent chat endpoint accept an agent_id and use that agent’s system prompt/tools. Panels in dashboard would show per-agent streams/results.

### Estimated time

4-8 hours (routing + UI panels).

### Can Cursor implement it?

Partially (orchestration logic and UI).

---

## 6. GitHub Integration

### Current state

- **Worker:** OAuth (worker.js 300, 303, 306); GET /api/integrations/github/repos, /files, /file, /raw (474-505); GET /api/repos/:repo/commits (544-561) — read-only (list repos, file contents, last commit). No createCommit, createOrUpdateFile, or push API found.

### What needs to happen

- Add GitHub write: create blob, create tree, create commit, update ref (push). Use integration token from getIntegrationToken(env.DB, authUser.id, 'github'). Endpoint e.g. POST /api/integrations/github/commit or /push with repo, branch, message, files[] (path, content). Then register a tool (e.g. github_commit) that calls this or use MCP to call external GitHub API.

### Estimated time

3-5 hours.

### Can Cursor implement it?

Yes.

---

## 7. Browser Preview & Playwright

### Current state

- **Worker:** runInternalPlaywrightTool (4754-4784) uses `@cloudflare/playwright`, env.MYBROWSER, env.DASHBOARD. Supports browser_navigate, browser_content, playwright_screenshot, browser_screenshot. Screenshot uploaded to DASHBOARD bucket and URL returned.
- **Invocation:** Only when tool is one of INTERNAL_PLAYWRIGHT_TOOLS and env.MYBROWSER and env.DASHBOARD exist; otherwise tool may be sent to MCP (MCP does not implement Playwright). Playwright tools are in ACTION_TOOLS and need approval.
- **Dashboard:** Preview panel exists (OPEN_IN_PREVIEW: url); embedding can be blocked by X-Frame-Options for some sites.

### What needs to happen

- Ensure MYBROWSER and DASHBOARD bindings are set in production if Playwright is required. Test playwright_screenshot and browser_screenshot from chat. Optionally add a "Browser" panel that shows screenshot or live URL.

### Estimated time

1-2 hours (config + test).

### Can Cursor implement it?

Yes.

---

## Prioritized Roadmap

### P0 — Must fix to replace Cursor (blockers)

| Item | Current | Action | Files | Est. |
|------|---------|--------|------|-----|
| Streaming + tools | Streaming disables tools for all; Anthropic tool loop is non-streaming | Implement streaming + tool_use loop (Anthropic first) and document | worker.js 3405-3532, new streamChatWithToolsAnthropic; docs/STREAMING_TOOLS_ARCHITECTURE.md | 4-6 h |

### P1 — Core daily use

| Item | Current | Action | Files | Est. |
|------|---------|--------|-------|-----|
| AI Search: index codebase | Only memory/docs in Vectorize | Index worker.js, agent-dashboard/, mcp-server into Vectorize (new prefix or job) | worker.js indexMemoryMarkdownToVectorize or new indexCodebaseToVectorize; R2 codebase/ or source | 2-4 h |
| AI Search: pre-inject RAG | Only when user message >10 words | Always run one RAG query and inject into system | worker.js 3232-3245 | 1 h |
| AI Search: performance | 1-2+ min for code questions | Direct Vectorize + cache by query hash | worker.js pre-inject + optional cache table or KV | 2-3 h |
| Tool testing | Only r2_write confirmed | Test d1_query, d1_write, terminal_execute, knowledge_search, r2_read, r2_list; document | Worker + dashboard or script | 2-3 h |

### P2 — Quality of life

| Item | Current | Action | Files | Est. |
|------|---------|--------|-------|-----|
| Multi-file editing | Single file in Monaco | Add tabs or second panel; document | FloatingPreviewPanel.jsx, AgentDashboard.jsx | 2-4 h |
| GitHub commit/push | Read-only | Add commit + push API and/or tool | worker.js new route; MCP or builtin tool | 3-5 h |
| File save workflow | Working single-file | Document and optionally add diff view | Docs + optional Monaco diff | 1 h |

### P3 — Polish & future

| Item | Current | Action | Files | Est. |
|------|---------|--------|-------|-----|
| MCP 4-panel orchestration | Tables and seeds exist; routing/UI partial | Implement dispatch and per-agent panels | worker.js /api/mcp/*; dashboard mcp.html or agent | 4-8 h |
| Playwright in production | Implemented but needs bindings | Set MYBROWSER + DASHBOARD; test | wrangler config; worker 4754-4784 | 1-2 h |
| Browser preview panel | iframe; some sites block | Optional: screenshot or external link for blocked sites | Dashboard preview component | 1-2 h |

---

## Summary

- **P0:** Streaming + tools (worker.js streaming path and new streamChatWithToolsAnthropic + doc).
- **P1:** Index codebase into Vectorize; always pre-inject RAG; optional Vectorize-direct + cache; test all tools.
- **P2:** Multi-file Monaco (or document single-file); GitHub commit/push; save workflow doc.
- **P3:** MCP 4-panel; Playwright config; browser preview polish.

Use the D1 and worker.js references above to implement each item. After P0 and P1, Agent Sam will be much closer to a Cursor replacement for daily coding (streaming with tools, fast code-aware search).
