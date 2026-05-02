# Metrics & Tracking Completeness — Quiz Answers & Validation Checklist

**Date:** 2026-03-18  
**Based on:** METRICS_AND_MONITORING_AUDIT.md, worker.js code review, autorag migration (iam-autorag).

---

## QUESTION 1: Agent Costs Tracking

### Current state (still accurate after autorag migration)

| Path | agent_costs written? | Notes |
|------|----------------------|--------|
| OpenAI streaming | Yes | streamDoneDbWrites (2295) |
| Google streaming | Yes | streamDoneDbWrites (2374) |
| Workers AI streaming | Yes | streamDoneDbWrites (2440) |
| Tool loop (non-streaming) | Yes | runToolLoop direct INSERT (2136) |
| **Anthropic streaming** | **No** | message_stop block (4129–4171) writes agent_telemetry + spend_ledger only; no agent_costs INSERT |

**Has anything changed that would affect cost tracking?**  
No. The autorag migration only changed the instance name string (`inneranimalmedia-aisearch` → `iam-autorag`). No cost-write paths were added or removed.

**What percentage of requests write to agent_costs correctly?**  
- All non-streaming tool-loop requests: 100% (runToolLoop writes at 2136).  
- All OpenAI/Google/Workers AI streaming: 100% (streamDoneDbWrites).  
- **Anthropic streaming:** 0% (no write).  
If a large share of chat is Anthropic streaming, the “missing” share is that portion (e.g. 30–50% of chat requests if Anthropic is primary).

**What percentage are missing (Anthropic streaming)?**  
Equal to the fraction of chat requests that use Anthropic with streaming and no tools. Example: if 40% of agent chat is Anthropic streaming, then 40% of chat requests have no agent_costs row.

### After autorag deploy

- No change to agent_costs behavior. Same paths write or don’t write.

### What to test to verify tracking

- [ ] **OpenAI/Google/Workers AI streaming:** Send a message, wait for stream done; query `SELECT * FROM agent_costs ORDER BY created_at DESC LIMIT 5` — expect a new row with correct model/tokens/cost.
- [ ] **Tool loop (any provider):** Use a tool (e.g. knowledge_search) in non-streaming mode; expect one agent_costs row for that request.
- [ ] **Anthropic streaming:** Send a message with Anthropic + stream; after done, check agent_costs — expect **no** new row for that completion (confirms the gap).

### Priority fix

- **Fix:** In the Anthropic streaming `message_stop` block (worker.js ~4129–4171), add an INSERT into `agent_costs` using the same shape as streamDoneDbWrites (model_used, tokens_in, tokens_out, cost_usd, task_type `'chat_stream'`, user_id). Use `inputTokens`, `outputTokens`, `amountUsd` already computed there.

---

## QUESTION 2: Tool Execution Tracking

### Current state (accurate)

**mcp_tool_calls:**

- **runToolLoop** (2082): Inserts only when `!BUILTIN_TOOLS.has(toolName)` (line 2076). `knowledge_search` is in BUILTIN_TOOLS (2075), so **runToolLoop does NOT write mcp_tool_calls for knowledge_search**.
- **invokeMcpToolFromChat** (5360): Calls `recordMcpToolCall` → INSERT at 5239. So **invokeMcpToolFromChat DOES write mcp_tool_calls for knowledge_search**.

**terminal_history:**

- Written at 2194, 2197 (runTerminalCommand with terminal_session_id), 2203/2206 (legacy session_id), 3129/3133 (another handler). “0 rows despite 9 terminal sessions” suggests either a different schema (e.g. session_id vs terminal_session_id), a different route, or try/catch swallowing errors.

### knowledge_search specifically

- **Does it write to mcp_tool_calls when invoked?**  
  **Only when invoked via invokeMcpToolFromChat.** Not when invoked via runToolLoop.

- **Which code path runs?**  
  - **Anthropic + tools:** chatWithToolsAnthropic → invokeMcpToolFromChat (5752) → writes mcp_tool_calls + ai_rag_search_history.  
  - **OpenAI/Google + tools:** runToolLoop (4241) → knowledge_search executed at 1958 → **no** mcp_tool_calls (builtin), **no** ai_rag_search_history.  
  - **Execute-approved-tool API:** invokeMcpToolFromChat (4624) → writes mcp_tool_calls + ai_rag_search_history.

- **Should we expect rows in mcp_tool_calls after testing RAG?**  
  **Yes** only if you test via (1) Anthropic model with tool use (e.g. “use knowledge_search to find X”), or (2) POST /api/agent/chat/execute-approved-tool with tool_name=knowledge_search.  
  **No** new mcp_tool_calls row if you only test via OpenAI/Google tool loop or via pre-inject RAG (chat without explicit tool call).

### After autorag deploy

- Same as above. Instance name change does not affect which path runs or whether mcp_tool_calls is written.

### What to test to verify tracking

- [ ] **Anthropic + knowledge_search:** In Agent mode with Anthropic, ask something that triggers knowledge_search; after response, `SELECT * FROM mcp_tool_calls WHERE tool_name = 'knowledge_search' ORDER BY created_at DESC LIMIT 3` — expect a row.
- [ ] **execute-approved-tool:** Call POST /api/agent/chat/execute-approved-tool with tool_name=knowledge_search, tool_input={query: "agent modes"}; expect mcp_tool_calls row.
- [ ] **OpenAI/Google + knowledge_search:** Same question with OpenAI/Google; expect **no** mcp_tool_calls row for that tool (current design).

### Priority fix (optional)

- If you want mcp_tool_calls for **all** tool invocations (including builtins in runToolLoop): add an INSERT for knowledge_search (and other builtins) inside runToolLoop after resultText is set, or call a shared recordMcpToolCall-style helper from runToolLoop for builtin tools.

---

## QUESTION 3: RAG Query Logging

### Current state (accurate)

**ai_rag_search_history** is written by exactly **2** call sites, not all 6:

| # | Location | Writes ai_rag_search_history? |
|---|----------|-------------------------------|
| 1 | /api/search (887) | Yes |
| 2 | runToolLoop knowledge_search (1958) | **No** |
| 3 | /api/agent/chat RAG pre-inject (3712) | **No** |
| 4 | /api/agent/rag/query (4467) | **No** |
| 5 | invokeMcpToolFromChat knowledge_search (5300) | Yes (5337 or 5348) |

So **only 2 of 6** autorag() call sites write to ai_rag_search_history: `/api/search` and **invokeMcpToolFromChat** knowledge_search.

### After autorag deploy

- Unchanged. Same two paths write; the other four still do not.

### Should we expect new rows after testing all 5 RAG paths?

| Test | Expect new row in ai_rag_search_history? |
|------|------------------------------------------|
| 1. Agent mode chat (RAG pre-inject) | No |
| 2. Dashboard global search (/api/agent/rag/query) | No |
| 3. agent.html RAG suggestions (/api/agent/rag/query) | No |
| 4. knowledge_search **tool** (Anthropic or execute-approved-tool) | Yes |
| 5. /api/search | Yes |

So you should expect new rows only when you hit **/api/search** or when the model (or UI) explicitly invokes the **knowledge_search** tool via invokeMcpToolFromChat.

### What to test to verify tracking

- [ ] **POST /api/search:** `curl -X POST .../api/search -d '{"query":"agent modes"}'` then `SELECT * FROM ai_rag_search_history ORDER BY created_at DESC LIMIT 1` — expect one row.
- [ ] **knowledge_search via invokeMcpToolFromChat:** Use Anthropic and a prompt that triggers knowledge_search, or call execute-approved-tool; expect one row per invocation.
- [ ] **/api/agent/rag/query:** Call it, then check ai_rag_search_history — expect **no** new row (current design).

### Priority fix (optional)

- If you want **all** RAG queries logged: add an INSERT into ai_rag_search_history in (1) /api/agent/rag/query after search, (2) chat RAG pre-inject block when ragContext is non-empty, and (3) runToolLoop after knowledge_search result. Same shape as existing inserts (id, tenant_id, query_text, context_used or retrieved_chunk_ids_json, created_at).

---

## QUESTION 4: Context Cache

### Current state (accurate)

- **ai_compiled_context_cache** is written on chat when we build context (cache miss): INSERT at 3845–3860. Key is `context_hash` = `${tenantId}:agent_sam:v1:${today}` (3736). TTL 30 min (1800 s). Stored value is `JSON.stringify(builtSections)` (sections: core, memory, kb, mcp, schema, daily, full).
- “1 row, 0 live (all expired)” means entries expire as designed; next request after expiry rebuilds and rewrites. Cache is not broken.

### After token efficiency refactor and autorag migration

- **Is cache still being written correctly?** Yes. Cache miss still builds builtSections and writes JSON; cache hit still reads and parses (3867–3871). No change from autorag migration.
- **Does the JSON sections format affect cache hit rate?** No. Hit rate depends only on context_hash and expires_at. Same hash and TTL as before; old plain-text cache entries still work (fallback to `{ full: compiledContext }` when JSON.parse fails).
- **Will cache invalidation happen when we switch RAG instances?** No. Cache key does not include RAG instance or RAG results. RAG (ragContext) is computed per request from autorag(); it is not stored in the cache. So no invalidation is needed when switching to iam-autorag.

### What to test to verify tracking

- [ ] **Cache write:** After a chat request (cache miss), `SELECT context_hash, length(compiled_context), expires_at FROM ai_compiled_context_cache ORDER BY last_accessed_at DESC LIMIT 1` — expect a row with JSON in compiled_context and expires_at > unixepoch().
- [ ] **Cache read:** Send another chat within 30 min (same tenant/date); second request should hit cache (no rebuild log storm). Optional: check access_count or last_accessed_at increased.

### Priority fix

- None for cache. Optional: extend TTL (e.g. 3600) if you want fewer rebuilds.

---

## QUESTION 5: Missing Metrics Priority

Ranking by impact and effort (1 = do first):

| Rank | Item | Impact | Effort | Reason |
|------|------|--------|--------|--------|
| **1** | **A. Anthropic streaming → agent_costs** | High | Low | One block already has tokens and cost; add one INSERT. Fixes cost visibility for a large share of chat. |
| **2** | **B. mcp_tool_calls verification** | Medium | Low | Confirm schema and which path runs; add logging or fix runToolLoop so builtin tools (e.g. knowledge_search) write if desired. |
| **3** | **C. terminal_history verification** | Medium | Medium | Trace where “9 terminal sessions” are created and which handler writes; align schema (terminal_session_id vs session_id) or route so INSERT runs. |
| **4** | **D. Context gauge enhancement** | Lower | Medium | Improves UX (e.g. last-reply stats); depends on A for accurate cost. |

---

## Deliverable: Validation Checklist

Use this to confirm tracking is correct before calling metrics “complete.”

### Agent costs

- [ ] OpenAI streaming: after one chat, agent_costs has a new row with correct model/tokens/cost.
- [ ] Google streaming: same check.
- [ ] Workers AI streaming: same check.
- [ ] Tool loop: after one tool use (non-streaming), agent_costs has a new row.
- [ ] Anthropic streaming: after one Anthropic stream, agent_costs has **no** new row (documents gap).
- [ ] **Fix:** Add agent_costs INSERT in Anthropic message_stop block; retest Anthropic streaming until a new row appears.

### Tool execution (mcp_tool_calls)

- [ ] Invoke knowledge_search via Anthropic (tool use) or execute-approved-tool; mcp_tool_calls has a row with tool_name = 'knowledge_search'.
- [ ] Invoke knowledge_search via OpenAI/Google tool loop; confirm no mcp_tool_calls row (or add write for builtins and re-check).
- [ ] Optional: add runToolLoop write for builtin tools; retest until both paths write.

### RAG query logging (ai_rag_search_history)

- [ ] POST /api/search with a query; ai_rag_search_history has a new row.
- [ ] knowledge_search via invokeMcpToolFromChat (Anthropic or execute-approved-tool); ai_rag_search_history has a new row.
- [ ] POST /api/agent/rag/query; confirm **no** row (or add INSERT if you want all RAG queries logged).
- [ ] Agent chat with RAG pre-inject only (no tool call); confirm no row (or add INSERT if desired).

### Context cache (ai_compiled_context_cache)

- [ ] After a chat request, cache has a row with valid JSON in compiled_context and future expires_at.
- [ ] Second request within TTL uses cache (e.g. access_count or last_accessed_at increases).

### Priority fixes (in order)

1. [ ] **Anthropic streaming → agent_costs:** Implement INSERT in message_stop block; verify with one Anthropic streaming request.
2. [ ] **mcp_tool_calls:** Verify or add write for knowledge_search (and other builtins) in runToolLoop if you want all tool uses logged.
3. [ ] **terminal_history:** Identify correct schema and handler; fix so terminal commands write.
4. [ ] **Context gauge:** Optionally add last-reply or server-side summary once cost/tool data is correct.

---

## Summary

- **Autorag migration:** No impact on agent_costs, mcp_tool_calls, ai_rag_search_history, or context cache logic. Only the RAG instance name changed.
- **Agent costs:** Anthropic streaming still does not write to agent_costs; all other paths do. Fix by adding one INSERT in the Anthropic message_stop block.
- **mcp_tool_calls:** knowledge_search writes only when invoked via invokeMcpToolFromChat (Anthropic tool use or execute-approved-tool), not via runToolLoop.
- **ai_rag_search_history:** Only /api/search and invokeMcpToolFromChat knowledge_search write; the other four autorag call sites do not. Expect new rows only for those two paths.
- **ai_compiled_context_cache:** Working as designed; JSON sections and RAG instance change do not require invalidation.
- **Priority order:** (1) Anthropic → agent_costs, (2) mcp_tool_calls verification, (3) terminal_history verification, (4) context gauge enhancement.
