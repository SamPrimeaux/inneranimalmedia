# Metrics and Monitoring Audit — What’s Set Up vs What’s Connected

**Date:** 2026-03-18  
**Purpose:** Clarify streaming vs non-streaming, what writes where, what’s broken, and what to connect so the context gauge and dashboards show accurate, useful data.

---

## 1. Streaming vs non-streaming (worker)

### What “streaming” and “non-streaming” mean here

- **Streaming:** The client asks for a stream (`body.stream === true`). The worker calls the provider (Anthropic, OpenAI, Google, Workers AI) with `stream: true`, reads chunks, and forwards them over SSE. When the stream ends, the worker has `input_tokens` / `output_tokens` from the provider (or estimates) and sends a `done` event, then does DB writes **once** at the end.
- **Non-streaming:** The client does **not** request a stream, or the worker chooses a non-streaming path (e.g. tool loop). The worker does one (or more) blocking HTTP calls to the provider, gets a full JSON response, then writes to DB and returns a single JSON response.

So “streaming” vs “non-streaming” is about **how the response is delivered to the client**, not whether we record metrics. Both paths can (and should) write to the same tables.

### Where each path writes (today)

| Path | agent_telemetry | spend_ledger | agent_costs |
|------|-----------------|--------------|-------------|
| **Anthropic streaming** (no tools) | Yes (inline on `message_stop`) | Yes (inline) | **No** (missing) |
| **OpenAI streaming** | Via `streamDoneDbWrites` | Via `streamDoneDbWrites` | Yes |
| **Google streaming** | Via `streamDoneDbWrites` | Via `streamDoneDbWrites` | Yes |
| **Workers AI streaming** | Via `streamDoneDbWrites` | Via `streamDoneDbWrites` | Yes (estimated tokens) |
| **Tool loop** (non-streaming) | Yes (in runToolLoop + after) | Yes | Yes |

So: **Anthropic streaming is the only path that never writes to `agent_costs`.** All streaming paths write to `agent_telemetry` and `spend_ledger` (so your D1 numbers match Claude’s console). The gap is only `agent_costs` for Anthropic streaming.

---

## 2. What’s set up (code and tables)

### Tables that exist and are used

- **agent_telemetry** — Written by streaming (all providers) and non-streaming (gateway, tool loop). Source for token counts and “agent calls” (e.g. Overview “313 agent calls”).
- **spend_ledger** — Same writers. Source for AI spend (finance APIs, Overview “AI Tooling”).
- **agent_costs** — Written by `streamDoneDbWrites` (OpenAI/Google/Workers AI streaming) and by `runToolLoop`. **Not** written by Anthropic streaming.
- **agent_messages** — Conversation history; written on every assistant reply (streaming and non-streaming).
- **agent_sessions / agent_conversations** — Session metadata; created when a new conversation starts.

### Tables that exist but are not (or barely) written

- **mcp_tool_calls** — Code exists in worker (`runToolLoop` ~2082, `recordMcpToolCall` ~5239, `chatWithToolsAnthropic` ~5168). If the audit shows 0 rows, either the code path is not hit (e.g. tools not used), or there is a schema/error path (try/catch swallows). Need to confirm which tool-invocation path actually runs in production.
- **terminal_history** — Code exists (~2194, 2203, 3129). “0 rows despite 9 terminal sessions” suggests writes use a different schema (e.g. `terminal_session_id` vs `session_id`) or the sessions are created elsewhere and commands are not going through the handler that inserts here.
- **ai_workflow_executions** — Written only by `POST /api/admin/trigger-workflow`. “0 rows” means no one has triggered a workflow; infrastructure is there, not yet used.
- **rag_chunks** — If this is the Vectorize index content, it may be populated by a separate indexing job, not by the chat path. “0 rows” could mean the vector index is empty or the table name differs.

### Context cache

- **ai_compiled_context_cache** — Written on chat when we build context (JSON sections). “1 row, 0 live (all expired)” means cache entries are expiring (e.g. 30 min TTL) and the next request after expiry rebuilds context. So “re-computing every call” happens when the cache has expired, not because the cache is broken. You can extend TTL or accept the recompute after idle.

---

## 3. Context gauge and popup (frontend)

### Current behavior

- **Est. tokens:** Client-side only. Sum of message lengths (chars/4) for the **current conversation**, excluding system messages. Denominator 200k. Not from the worker.
- **Context Xk / 200k:** Same source; percentage used for the mini donut.
- **Cost:** From `telemetry.total_cost`, which is **accumulated from each `done` event** (`data.cost_usd`) in this session. So it shows “session spend so far” once at least one response has finished and sent `done` with a non-zero `cost_usd`.

If you see **Cost: $0.00** it can mean: (1) no `done` event has been received yet this session, (2) the provider path sent `cost_usd: 0` (e.g. missing usage), or (3) you switched to a new conversation (state resets).

### Ways to use this without limiting you

- **Option A — Enrich the popup:** Keep current source; add one line from the **last** `done` event: “Last reply: X in / Y out, $Z.” That stays client-side and does not require new APIs.
- **Option B — Back the gauge with real data:** Add an optional API (e.g. `GET /api/agent/telemetry/summary?session_id=...`) that returns `{ total_input_tokens, total_output_tokens, total_cost }` for that session from `agent_telemetry` / `spend_ledger`. The gauge could show server truth instead of (or in addition to) client estimate.
- **Option C — Fix broken pipelines first:** Before adding more UI, fix the missing `agent_costs` write for Anthropic streaming and (if you care) confirm why `mcp_tool_calls` / `terminal_history` are empty so “Data Accuracy” is correct.

---

## 4. What to connect / implement (priority)

### High impact, low effort

1. **Anthropic streaming → agent_costs**  
   In the Anthropic streaming block where you already write to `agent_telemetry` and `spend_ledger` on `message_stop`, add an `INSERT` into `agent_costs` (same shape as in `streamDoneDbWrites`: model_used, tokens_in, tokens_out, cost_usd, task_type `'chat_stream'`, user_id). Then all streaming paths will feed the same cost table.

2. **Context gauge “Cost” from `done`**  
   Ensure every streaming path sends `cost_usd` in the `done` event (and that it’s computed from real usage when the provider supplies it). The gauge already uses it; no new UI, just correctness.

### Medium impact (accuracy and visibility)

3. **Confirm mcp_tool_calls**  
   Verify which tool path runs when you use MCP tools (e.g. from chat). If it’s `runToolLoop`, check that the insert isn’t failing (schema, tenant_id, etc.). If it’s another path, add an insert there or document why this table is not used.

4. **Confirm terminal_history**  
   Check whether “9 terminal sessions” are created by the same worker that does `INSERT INTO terminal_history`. If terminal commands go through a different route (or a different schema like `session_id` vs `terminal_session_id`), align the schema or the handler so history is written.

5. **Overview “Worker Requests”**  
   Replace the placeholder with a real metric: e.g. count of requests to `/api/agent/chat` from logs or a simple counter table. Optionally split by streaming vs non-streaming if you add a column or tag.

### Lower priority / optional

6. **RAG / Vectorize**  
   If `rag_chunks` is meant to reflect the Vectorize index, either wire the indexer to write metadata into D1 or document that this table is not the source of truth for the vector store.

7. **workflow_executions**  
   No change needed until you trigger workflows; then the existing trigger endpoint will populate it.

---

## 5. Summary

- **Streaming** = SSE response; metrics are written **once** when the stream finishes (same as non-streaming in terms of “one row per completion”).
- **Non-streaming** = single JSON response (e.g. tool loop); metrics written after the response.
- **What’s working:** agent_telemetry and spend_ledger are written by all streaming and non-streaming paths we checked; numbers match Claude’s console.
- **What’s missing:** agent_costs is not written for **Anthropic streaming**; other streaming paths already write it.
- **Context gauge:** Uses client-side token estimate and session-accumulated cost from `done` events; can be enhanced with last-reply stats or a small server-side summary API.
- **Broken / “DEAD”:** Main fix is Anthropic streaming → agent_costs. Then validate mcp_tool_calls and terminal_history code paths so the “Data Accuracy” doc reflects reality.

Implementing the Anthropic streaming → agent_costs insert and verifying the tool/terminal paths will give you consistent metrics across streaming vs non-streaming and a solid base for any gauge or dashboard improvements.
