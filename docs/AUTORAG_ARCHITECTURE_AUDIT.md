# Comprehensive AutoRAG Architecture Audit

**Date:** 2026-03-18  
**Purpose:** Complete map of RAG and knowledge systems before migrating to `iam-autorag` instance.

---

## PART 1: RAG IMPLEMENTATION AUDIT

### 1. All locations that call `env.AI.autorag('inneranimalmedia-aisearch')`

There are **6 invocations** across **5 code locations** in `worker.js`. (One location has two calls in a single `Promise.all`.) If counting each line reference separately you get 7+ lines; the table below lists every distinct call site and invocation.

| # | File | Lines | Function / route | Trigger | What happens with results |
|---|------|--------|------------------|--------|----------------------------|
| 1a | worker.js | 884 | `/api/search` handler | POST/GET with `query` | `aiSearch({ query, stream: false })` — LLM answer; result stored in `ai.response`, and `search.data` as sources. Both written to `ai_rag_search_history` (context_used = JSON of `ai`). Response: `{ answer: ai.response, sources: search.data }`. |
| 1b | worker.js | 885 | Same | Same request | `search({ query })` — retrieval only; result used as `sources` in response and in history. |
| 2 | worker.js | 1958 | `runToolLoop` (tool execution) | Model requests tool `knowledge_search` with `params.query` | `search({ query, max_num_results: max_results })` (max_results capped 1–10). Results normalized to `{ query, results: [{ content, source, score }] }`, returned as `resultText` to the model. |
| 3 | worker.js | 3712–3713 | `/api/agent/chat` handler | `chatMode === 'agent'` and `env.AI` and last user message has ≥10 words | `search({ query: lastUserContent })`. Raw results flattened to a single string, capped at `PROMPT_CAPS.RAG_CONTEXT_MAX_CHARS` (3000), stored in `ragContext` and injected into system prompt via `buildModeContext` (see below). |
| 4 | worker.js | 4467–4468 | `/api/agent/rag/query` handler | POST with body `{ query }` or `{ q }` | `search({ query: query.trim() })`. Results mapped to text chunks; response `{ matches: chunks, count }`. Used by dashboard global search and agent.html RAG suggestions. |
| 5 | worker.js | 5300–5301 | `invokeMcpToolFromChat` (MCP tool) | Tool name `knowledge_search` with `params.query` | `search({ query, max_num_results: 5 })`. If 0 results, fallback: embed with `RAG_MEMORY_EMBED_MODEL`, `env.VECTORIZE.query(vector, { topK: 5 })`, then `env.R2.get(source)` for each match. Results + answer written to `ai_rag_search_history`. Returned as tool result to caller. |

**Full function context (snippets):**

```877:889:worker.js
      // ----- API: Search (AI RAG + history) -----
      if (url.pathname === '/api/search') {
        const query = request.method === 'POST'
          ? (await request.json()).query
          : url.searchParams.get('q');
        if (!query) return Response.json({ error: 'query required' }, { status: 400 });
        const [ai, search] = await Promise.all([
          env.AI.autorag('inneranimalmedia-aisearch').aiSearch({ query, stream: false }),
          env.AI.autorag('inneranimalmedia-aisearch').search({ query })
        ]);
        await env.DB.prepare("INSERT INTO ai_rag_search_history ...").bind(...).run();
        return Response.json({ answer: ai.response, sources: search.data });
      }
```

```1954:1971:worker.js
      } else if (toolName === 'knowledge_search' && env.AI) {
        const query = params.query ?? '';
        const max_results = Math.min(Math.max(1, Number(params.max_results) || 5), 10);
        try {
          const searchResult = await env.AI.autorag('inneranimalmedia-aisearch').search({
            query: query,
            max_num_results: max_results,
          });
          resultText = JSON.stringify({
            query: searchResult.search_query ?? query,
            results: (searchResult.data ?? []).map(item => ({ content: item.content ?? item.text, source: item.source ?? item.metadata?.source ?? 'unknown', score: item.score })),
          });
        } catch (e) {
          resultText = JSON.stringify({ error: e?.message ?? String(e) });
        }
      }
```

```3706:3727:worker.js
      let ragContext = '';
      const RAG_MIN_QUERY_WORDS = 10;
      const RAG_MIN_CONTEXT_CHARS = 100;
      const runRag = (chatMode === 'agent') && env.AI && lastUserContent && lastUserContent.split(' ').length >= RAG_MIN_QUERY_WORDS;
      if (runRag) {
        try {
          const results = await env.AI.autorag('inneranimalmedia-aisearch')
            .search({ query: lastUserContent });
          const rawResults = results?.results ?? results?.data ?? [];
          if (rawResults.length) {
            const raw = rawResults
              .map(r => typeof r === 'string' ? r : r.text ?? r.content?.[0]?.text ?? '')
              .filter(Boolean)
              .join('\n\n');
            if (raw.length >= RAG_MIN_CONTEXT_CHARS) {
              ragContext = capWithMarker(raw, PROMPT_CAPS.RAG_CONTEXT_MAX_CHARS);
            }
          }
        } catch (e) {
          console.error('[agent/chat] AISEARCH failed:', e?.message ?? e);
        }
      }
```

```4462:4477:worker.js
    if (pathLower === '/api/agent/rag/query' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const query = body.query || body.q || '';
        if (!query.trim()) return jsonResponse({ error: 'query required' }, 400);
        const results = await env.AI.autorag('inneranimalmedia-aisearch')
          .search({ query: query.trim() });
        const rawResults = results?.results ?? results?.data ?? [];
        const chunks = rawResults.map(r => ...).filter(Boolean);
        return jsonResponse({ matches: chunks, count: chunks.length });
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e), matches: [] }, 500);
      }
    }
```

```5292:5366:worker.js
  if (tool_name === 'knowledge_search' && env.AI) {
    const query = (params.query ?? params.search_query ?? '').trim();
    ...
    const aiSearchResponse = await env.AI.autorag('inneranimalmedia-aisearch').search({
      query,
      max_num_results: 5,
    });
    let results = aiSearchResponse?.results ?? aiSearchResponse?.data ?? [];
    if (results.length === 0 && env.VECTORIZE && env.R2 && env.AI) {
      // Vectorize fallback: embed query -> VECTORIZE.query -> R2.get(metadata.source)
    }
    // ... record to ai_rag_search_history, return resultText
  }
```

---

### 2. RAG flow mapping

- **When RAG is triggered:**
  - **Chat (pre-inject):** Only when `chatMode === 'agent'`, `env.AI` is set, and the last user message has ≥10 words and yields ≥100 chars of raw result text (worker.js 3708–3726).
  - **Tool (runToolLoop):** When the model calls the `knowledge_search` tool with a `query` (worker.js 1954–1971).
  - **Tool (invokeMcpToolFromChat):** When MCP/client invokes `knowledge_search` with a `query` (worker.js 5292–5366).
  - **API:** When `POST /api/search` or `POST /api/agent/rag/query` is called with a non-empty query (worker.js 878–889, 4462–4477).

- **Query construction:**
  - Chat: `query = lastUserContent` (last user message text).
  - runToolLoop: `query = params.query`, `max_num_results` 1–10.
  - invokeMcpToolFromChat: `query = params.query ?? params.search_query`, `max_num_results: 5`.
  - `/api/agent/rag/query`: `query = (body.query || body.q).trim()`.
  - `/api/search`: `query` from JSON body or `q` query param.

- **Result processing:**
  - All paths normalize to `results?.results ?? results?.data ?? []`.
  - Each item is treated as having `text` or `content` (or `content[0].text`); concatenated and optionally capped.
  - Chat: concatenate → cap with `capWithMarker(raw, PROMPT_CAPS.RAG_CONTEXT_MAX_CHARS)` → `ragContext`.
  - `/api/agent/rag/query`: map to string chunks → `{ matches, count }`.
  - knowledge_search tools: map to `{ content, source, score }` and return as JSON string for the model / MCP.

- **Where `ragContext` is injected:**
  - `ragContext` is passed into `buildModeContext(chatMode, resolvedSections, compiledContext, ragContext, fileBlock, model)` (worker.js 3898).
  - **buildModeContext** (worker.js 1511–1515) delegates to:
    - **buildAskContext** (1472–1479): if `ragContext`, appends `\n\nRelevant platform context:\n` + `capWithMarker(ragContext, 1500)`.
    - **buildPlanContext** (1483–1490): if `ragContext`, appends `\n\nRelevant platform context:\n` + `ragContext` (no extra cap).
    - **buildAgentContext** (1495–1498): if `ragContext`, prepends `Relevant platform context:\n` + `ragContext` + `\n\n` before compiled context.
    - **buildDebugContext** (1503–1506): does not use `ragContext` (debug mode has no RAG block).
  - Final system string: `coreSystemPrefix + buildModeContext(...)` (worker.js 3898); that becomes `systemWithBlurb` then `finalSystem` (with optional session summary).

- **Multiple RAG paths:**
  - **Streaming vs non-streaming:** Chat can stream; RAG itself is always a single `search()` call before building the system prompt. No separate streaming RAG path.
  - **Modes:** RAG runs only for **agent** mode in chat. Ask/Plan/Debug get `ragContext` only if it were set (in practice agent-only), and Ask/Plan cap or include it per builder above; Debug ignores it.
  - **Tool path:** Two tool paths (runToolLoop and invokeMcpToolFromChat) both call `.search()`; the second has a Vectorize+R2 fallback when AutoRAG returns 0 results.

---

### 3. Current RAG configuration

- **Parameters passed to `autorag().search()`:**
  - **query:** Always present (string).
  - **max_num_results:** Only in tool paths: runToolLoop 1–10 (from params, default 5); invokeMcpToolFromChat fixed 5. Chat and `/api/agent/rag/query` do not pass `max_num_results` (rely on backend default).

- **Parameters for `autorag().aiSearch()`:**
  - Only `/api/search` uses it: `{ query, stream: false }`.

- **RAG-specific constants / caps (worker.js):**
  - `PROMPT_CAPS.RAG_CONTEXT_MAX_CHARS: 3000` (line 1417) — chat RAG context truncated with `capWithMarker(..., RAG_CONTEXT_MAX_CHARS)` (line 3721).
  - `RAG_MIN_QUERY_WORDS = 10` (line 3707) — minimum word count in last user message to run RAG in chat.
  - `RAG_MIN_CONTEXT_CHARS = 100` (line 3708) — minimum raw result length to set `ragContext` in chat.
  - buildAskContext uses a 1500-char cap on `ragContext` (line 1478): `capWithMarker(ragContext, 1500)`.

- **Line references for RAG-related constants:**
  - PROMPT_CAPS: 1410–1421 (includes RAG_CONTEXT_MAX_CHARS 1417, TRUNCATION_MARKER 1418).
  - capWithMarker: 1423–1426.
  - RAG_MIN_QUERY_WORDS / RAG_MIN_CONTEXT_CHARS: 3707–3708.
  - RAG_CONTEXT_MAX_CHARS usage: 3721.
  - RAG embedding/batch (for Vectorize fallback and indexMemoryMarkdownToVectorize): RAG_MEMORY_EMBED_MODEL 5927, RAG_EMBED_BATCH_SIZE 5930, RAG_CHUNK_MAX_CHARS 5928, RAG_CHUNK_OVERLAP 5929.

---

## PART 2: KNOWLEDGE ARCHITECTURE AUDIT

### 1. Knowledge / memory storage map

**R2 buckets used for knowledge:**

| Bucket (binding) | Purpose | Keys / structure |
|-------------------|---------|-------------------|
| **iam-platform** (R2) | Memory, knowledge, schema, daily logs, conversation summaries | `memory/schema-and-records.md`, `memory/daily/YYYY-MM-DD.md`, `memory/today-todo.md`, `memory/compacted-chats/`, `knowledge/` (e.g. `knowledge/architecture/`, `knowledge/database/`, `knowledge/memory/daily-*.md`, `knowledge/priorities/current.md`, `knowledge/conversations/{id}-summary.md`), `docs/`. Used by compiled context (chat), session summary, and by `indexMemoryMarkdownToVectorize` (which lists `memory/daily/`, `memory/compacted-chats/`, `knowledge/`, `docs/`). |
| **agent-sam** (DASHBOARD) | Dashboard assets, source backup, screenshots, overnight script | `static/dashboard/*`, `source/`, screenshots, overnight script key. Not used for RAG memory content; `performCodebaseIndexing` lists `source/` for code search but Vectorize upsert is disabled (see worker.js 6405–6408). |

**D1 tables used for memory / knowledge:**

| Table | Purpose |
|-------|---------|
| **agent_memory_index** | Key-value memory (e.g. today_todo, active_priorities, build_progress). Queried for compiled context (importance_score >= 0.9, limit 50) and for daily sync (importance_score >= 7). |
| **ai_knowledge_base** | Domain docs (title, content, category). Queried for compiled context (limit 15). Optionally indexed to Vectorize via `/api/admin/vectorize-kb` (worker.js 454–494); `is_indexed` tracked per row. |
| **ai_compiled_context_cache** | Cached compiled context (JSON sections or full blob) keyed by context_hash (tenant + date). TTL 30 min (1800 s). Invalidated on agent_memory_index / ai_knowledge_base writes. |
| **ai_rag_search_history** | Log of RAG queries: query_text, context_used (or retrieved_chunk_ids_json), tenant_id, created_at. Written by `/api/search`, runToolLoop (indirect via tool result), invokeMcpToolFromChat knowledge_search. |
| **roadmap_steps** | Active roadmap; synced to R2 `knowledge/priorities/current.md` by runKnowledgeDailySync. |

**Vectorize indexes:**

| Binding | Index name | Purpose |
|---------|------------|---------|
| **VECTORIZE** | ai-search-inneranimalmedia-aisearch | Single index used for: (1) AutoRAG/AI Search backend (worker calls `env.AI.autorag('inneranimalmedia-aisearch')`), (2) direct `env.VECTORIZE.query()` in knowledge_search fallback when AutoRAG returns 0 results. Dimensions 1024, cosine (see worker.js 6233). Manual upsert from worker is **disabled** (indexMemoryMarkdownToVectorize and performCodebaseIndexing comment out Vectorize.upsert to avoid corrupting the same index used by AI Search). |

**AI Search instances:**

| Current (worker code) | Config (wrangler) |
|----------------------|-------------------|
| **inneranimalmedia-aisearch** | Referred to only as the string passed to `env.AI.autorag('inneranimalmedia-aisearch')`. Vectorize index name in wrangler is `ai-search-inneranimalmedia-aisearch` (wrangler.production.toml line 66). |
| **iam-autorag** | Defined in wrangler.production.toml (lines 32–34): `[[ai_search]]` binding = `AI_SEARCH`, `search_name = "iam-autorag"`. **Not used anywhere in worker.js**; worker uses only `env.AI.autorag('inneranimalmedia-aisearch')`. |

---

### 2. Knowledge retrieval paths

- **Worker reads from R2 directly when:**
  - Building compiled context: `memory/schema-and-records.md`, `memory/daily/{today,yesterday}.md` (worker.js 3764–3778).
  - Session summary: `knowledge/conversations/{session_id}-summary.md` (worker.js 3903).
  - Bootstrap / today-todo: `memory/today-todo.md` (worker.js 4912, 5000, 5004).
  - knowledge_search Vectorize fallback: after `VECTORIZE.query()`, fetches full text via `env.R2.get(metadata.source)` (worker.js 5320).
  - indexMemoryMarkdownToVectorize: lists and gets R2 keys under `memory/daily/`, `memory/compacted-chats/`, `knowledge/`, `docs/` (worker.js 6237–6257).

- **Worker uses RAG / vector search when:**
  - Any of the 6 autorag call sites run (chat pre-inject, runToolLoop knowledge_search, invokeMcpToolFromChat knowledge_search, `/api/search`, `/api/agent/rag/query`).
  - knowledge_search fallback: direct `env.VECTORIZE.query(vector, { topK: 5, returnMetadata: 'all' })` when AutoRAG returns 0 results (worker.js 5313).

- **Worker queries D1 for memory when:**
  - Compiled context (cache miss): agent_memory_index (high importance), ai_knowledge_base (limit 15), mcp_services (worker.js 3788–3815).
  - Bootstrap: agent_memory_index (today_todo), ai_compiled_context_cache (worker.js 4907, 4957, 4983, 5011).
  - Daily sync: agent_memory_index (importance_score >= 7), roadmap_steps (worker.js 6049+).

- **Multiple sources combined:** Yes. Final system prompt = core prefix + buildModeContext(sections, ragContext, fileContext) + optional session summary. Sections come from: core, memory (agent_memory_index), kb (ai_knowledge_base), mcp, schema (R2), daily (R2). RAG is an additional block (“Relevant platform context”) when present.

---

### 3. Context assembly

- **compiledContext:** Built on cache miss from: agentSamSystemCore + memoryIndexBlurb + knowledgeBlurb + mcpBlurb + schemaBlurb + dailyMemoryBlurb (worker.js 3838–3840). Stored in ai_compiled_context_cache as JSON of sections (worker.js 3844–3860). On hit, loaded from cache (3748–3756). Resolved to `resolvedSections` (JSON parse or `{ full: compiledContext }`) at 3865–3871.
- **ragContext:** Set only in chat when runRag is true and raw result length >= RAG_MIN_CONTEXT_CHARS; value is capped raw AutoRAG result (worker.js 3706–3726).
- **fileContext:** From request body `fileContext` (filename, content, startLine, endLine); formatted as “CURRENT FILE OPEN IN MONACO” block and capped at FILE_CONTEXT_MAX_CHARS (worker.js 3874–3895). Passed as `fileBlock` into buildModeContext.
- **memoryContext:** Not a single variable; “memory” is the section `memoryIndexBlurb` (agent_memory_index) inside compiled context.

**Combination into final system prompt:**

1. `coreSystemPrefix` = “SYSTEM: You are Agent Sam. Resolved model: …” (worker.js 3873).
2. `systemWithBlurb = coreSystemPrefix + buildModeContext(chatMode, resolvedSections, compiledContext, ragContext, fileBlock, model)` (worker.js 3898).
3. `finalSystem = systemWithBlurb`; then if session summary exists, append “[Previous session summary]:” + summary and trim to last LAST_N_VERBATIM_TURNS messages (worker.js 3899–3909).

**Line references:**

- buildModeContext: 1511–1515.
- buildAskContext, buildPlanContext, buildAgentContext, buildDebugContext: 1472–1506.
- Chat: compiledContext build and cache: 3729–3863; resolvedSections: 3865–3871; fileBlock: 3874–3895; systemWithBlurb: 3898; finalSystem and summary: 3899–3909.

---

## PART 3: MIGRATION IMPACT ANALYSIS

### 1. What breaks if we change `'inneranimalmedia-aisearch'` to `'iam-autorag'`

- **Dependencies on the old instance name:**
  - All 6 invocations in worker.js use the string `'inneranimalmedia-aisearch'`. Replacing it with `'iam-autorag'` assumes the Cloudflare AI/Workers AI `autorag()` API accepts an instance name `iam-autorag` that is configured to the same (or migrated) index. If the new product uses a different binding (e.g. `env.AI_SEARCH`) and a different API (e.g. `env.AI_SEARCH.search({ query })`), then every call site must be updated to the new API and the new binding.
  - No other files in the repo reference the string `inneranimalmedia-aisearch` for runtime behavior except wrangler.production.toml (Vectorize `index_name = "ai-search-inneranimalmedia-aisearch"`). If iam-autorag uses a different Vectorize index name, wrangler may need a new or updated Vectorize binding and the fallback path (invokeMcpToolFromChat) assumes VECTORIZE still points to an index that has the same vectors (or the fallback may need to point to the new index).

- **Cached references / hardcoded paths:**
  - No in-memory or KV cache of the instance name. ai_rag_search_history stores query/context, not instance name. Compiled context cache does not store the RAG instance name.
  - Hardcoded: the 6 call sites and the comment at worker.js 6233 (“matches AI Search inneranimalmedia-aisearch”).

- **Related config:**
  - wrangler.production.toml: `[[vectorize]]` index_name = `ai-search-inneranimalmedia-aisearch` (line 66). If iam-autorag uses a different index, either that index must be created and bound, or the existing index must be linked to the new instance name.
  - wrangler already has `[[ai_search]]` with search_name = `iam-autorag` and binding `AI_SEARCH` (lines 32–34). Worker does not use `env.AI_SEARCH` yet.

---

### 2. What else uses the old iam-platform bucket

- **Conversation history:** Compacted conversations are written to R2 **iam-platform** as `knowledge/conversations/{id}-summary.md` by `compactConversationToKnowledge` (worker.js 6079+). Session summary is read from the same key in chat (3903). So iam-platform is still required for conversation summaries.
- **Daily logs:** runKnowledgeDailySync writes to **iam-platform**: `knowledge/memory/daily-YYYY-MM-DD.md`, `knowledge/priorities/current.md` (worker.js 6041+). Compiled context also reads from **iam-platform**: `memory/daily/`, `memory/schema-and-records.md`, `memory/today-todo.md`. So iam-platform is still required for daily logs and memory blobs.
- **Full migration to autorag:** RAG retrieval can move to iam-autorag (new instance) while **storage** of markdown and summaries remains on iam-platform. The new AutoRAG instance must be populated from the same R2 (or from the same Vectorize index). So we can migrate **retrieval** to iam-autorag; we cannot “fully” remove iam-platform without moving all memory/knowledge/conversation keys to another bucket and updating every R2.get/list that targets those keys.

---

### 3. Coordination points

- **Frontend references to AI Search / RAG:**
  - **agent-dashboard (AgentDashboard.jsx):** Fetches `POST /api/agent/rag/query` with `{ query }` for the global knowledge search (lines 391–396). No reference to instance name or AI Search branding.
  - **dashboard/agent.html:** Calls `fetch(origin + '/api/agent/rag/query', { method: 'POST', body: JSON.stringify({ query }) })` for RAG suggestions (lines 1071–1076). No instance name.
  - No frontend code references `inneranimalmedia-aisearch` or `iam-autorag`; they only call the worker API.

- **Cron / background:**
  - Cron `0 6 * * *` (worker.js 5858–5876): runs compactAgentChatsToR2 → runKnowledgeDailySync → indexMemoryMarkdownToVectorize. indexMemoryMarkdownToVectorize builds vectors from R2 but **does not upsert** to Vectorize (upsert disabled to avoid corrupting the index used by AI Search). So cron does not directly call autorag; it prepares R2 content. If the new iam-autorag instance is populated by Cloudflare (e.g. from R2 or from a different pipeline), cron may need to stay as-is or be adapted to that pipeline.
  - No other crons call RAG or autorag.

- **Admin endpoints:**
  - `POST /api/agent/rag/query` — public RAG query (used by dashboard and agent.html).
  - `POST /api/agent/rag/index-memory` — runs indexMemoryMarkdownToVectorize (no upsert; returns counts).
  - `POST /api/agent/rag/compact-chats` — compactConversationToKnowledge; optional `then_index` runs indexMemoryMarkdownToVectorize.
  - None of these reference the instance name in the request; they use env.AI.autorag in code.

---

## PART 4: COMPLETE ARCHITECTURE DIAGRAM

### Request flow: User query to Claude API

```
User Query
    |
    v
[Mode: Ask | Plan | Agent | Debug]  (body.mode / default 'agent')
    |
    v
[Context build]
    |-- compiledContext: cache hit OR (schema + daily + memoryIndex + kb + mcp + schema blurb from R2/D1)
    |-- ragContext: only if mode === 'agent' and last user message has >= 10 words
    |       -> env.AI.autorag('inneranimalmedia-aisearch').search({ query: lastUserContent })
    |       -> raw results capped at 3000 chars -> "Relevant platform context"
    |-- fileContext: body.fileContext (Monaco file) -> "CURRENT FILE OPEN IN MONACO" block
    |-- session summary: if session_id and messages > 6, R2 get knowledge/conversations/{id}-summary.md
    v
[When does RAG trigger?]
    - Chat: only in Agent mode, >= 10 words, env.AI present.
    - Tools: when model/MCP calls knowledge_search (runToolLoop or invokeMcpToolFromChat).
    - API: /api/search and /api/agent/rag/query on every request with query.
    v
[Where does RAG pull from?]
    - Currently: env.AI.autorag('inneranimalmedia-aisearch') only (all 6 call sites).
    - Fallback (invokeMcpToolFromChat knowledge_search only): if 0 results -> env.VECTORIZE.query (index ai-search-inneranimalmedia-aisearch) + env.R2.get(metadata.source).
    - New instance: iam-autorag not used in code yet; wrangler has [[ai_search]] search_name = "iam-autorag" (binding AI_SEARCH).
    v
[How is RAG result combined?]
    - Chat: ragContext passed to buildModeContext -> prepended (Agent) or appended (Ask/Plan) as "Relevant platform context", capped per mode.
    - Tools: result returned as JSON string in tool result.
    - /api/agent/rag/query: returned as { matches, count }.
    - /api/search: aiSearch answer + search.data as sources.
    v
[Final prompt assembly]
    finalSystem = coreSystemPrefix + buildModeContext(..., ragContext, fileBlock, ...) [+ session summary]
    v
Claude API (or OpenAI / Google / Workers AI) with system = finalSystem, messages = apiMessages
```

### Knowledge storage (text diagram)

```
Knowledge Storage
-----------------

R2 Buckets:
  - iam-platform (R2): memory/schema-and-records.md, memory/daily/*.md, memory/today-todo.md,
    memory/compacted-chats/, knowledge/* (daily sync, priorities, conversations summaries), docs/
  - agent-sam (DASHBOARD): static/dashboard/*, source/* (code indexing disabled), screenshots, overnight script

D1 Tables:
  - agent_memory_index: key-value memory (today_todo, priorities, etc.); used for compiled context and daily sync
  - ai_knowledge_base: domain docs; used for compiled context and optional Vectorize indexing (admin)
  - ai_compiled_context_cache: cached system context (hash + date, 30 min TTL)
  - ai_rag_search_history: RAG query log
  - roadmap_steps: synced to R2 knowledge/priorities/current.md

Vectorize Indexes:
  - ai-search-inneranimalmedia-aisearch (VECTORIZE): 1024 dims, cosine; used by autorag('inneranimalmedia-aisearch') and by knowledge_search fallback

AI Search Instances:
  - Old (in use): inneranimalmedia-aisearch (via env.AI.autorag('inneranimalmedia-aisearch'))
  - New (config only): iam-autorag ([[ai_search]] binding AI_SEARCH; not referenced in worker)
```

---

## PART 5: RECOMMENDED MIGRATION PATH

### 1. Safest migration approach

- **Clean cutover vs gradual:** A single cutover is possible if the new `iam-autorag` instance is populated with the same (or equivalent) content as the current index and the API is compatible. If the new product uses a different API (e.g. `env.AI_SEARCH.search()`), then a single code change that replaces all 6 call sites and any fallback logic is the simplest.
- **Run both temporarily:** Optional. If you keep the old instance name working and add a feature flag or env var to switch between `inneranimalmedia-aisearch` and `iam-autorag`, you can compare results before full cutover. Not required if the new instance is known to be equivalent.
- **Rollback:** Keep the old instance and index in place until the new one is verified. Rollback = revert worker.js to use `'inneranimalmedia-aisearch'` again and redeploy. No schema or D1 changes are required for rollback; only worker code and possibly wrangler bindings.

### 2. Complete change list

**If migrating to `env.AI.autorag('iam-autorag')` (same API, new instance name):**

| File | Line(s) | Change |
|------|--------|--------|
| worker.js | 884 | Replace `'inneranimalmedia-aisearch'` with `'iam-autorag'` in both `autorag(...)` calls. |
| worker.js | 885 | Same. |
| worker.js | 1958 | Replace `'inneranimalmedia-aisearch'` with `'iam-autorag'`. |
| worker.js | 3712 | Replace `'inneranimalmedia-aisearch'` with `'iam-autorag'`. |
| worker.js | 4467 | Replace `'inneranimalmedia-aisearch'` with `'iam-autorag'`. |
| worker.js | 5300 | Replace `'inneranimalmedia-aisearch'` with `'iam-autorag'`. |
| worker.js | 6233 | Update comment to say "matches AI Search iam-autorag" (or new index name). |

**If migrating to `env.AI_SEARCH` (new binding):**

- Confirm Cloudflare AI Search API (e.g. `env.AI_SEARCH.search({ query })`). Then:
  - Replace every `env.AI.autorag('inneranimalmedia-aisearch').search(...)` with `env.AI_SEARCH.search(...)` (and same for `.aiSearch` if still needed on `/api/search`).
  - Ensure request/response shapes match (e.g. `results` vs `data`, `max_num_results` vs `topK`).
  - If AI_SEARCH uses a different index, update the knowledge_search Vectorize fallback to use the correct index/binding (or remove fallback if the new service always returns results).

**Configuration:**

- wrangler.production.toml: Already has `[[ai_search]]` with search_name = "iam-autorag". If the new instance uses a different Vectorize index, add or update `[[vectorize]]` and point the AI Search instance to it in the Cloudflare dashboard (or per Cloudflare docs).
- No dashboard or frontend config changes for a pure instance-name or binding switch.

**Deployment:**

1. Deploy worker after code and config changes (`npm run deploy` per project rules).
2. No R2 upload needed unless you change dashboard HTML (this migration does not).
3. If you use a separate deploy-record script, run it after deploy.

### 3. Testing plan

**Before deploy:**

- Run a local or staging build; call `POST /api/agent/rag/query` with a known query and confirm response shape and non-empty matches if content exists.
- Optionally run the same query against current production and compare match count or snippets (after cutover, compare with new instance).

**After deploy:**

- **Chat (Agent mode):** Send a message with ≥10 words that should hit knowledge (e.g. “What do we know about the worker architecture?”). Confirm reply uses platform context (no need to assert exact text; spot-check).
- **knowledge_search tool:** From the dashboard or MCP, invoke knowledge_search with a query; confirm no 500 and that results (or fallback) return.
- **Global search:** In dashboard, use the search that calls `/api/agent/rag/query`; confirm knowledge results appear when applicable.
- **agent.html:** Type in the search box (≥3 chars) and confirm RAG suggestions load.
- **/api/search:** If used, POST with a query and confirm `{ answer, sources }` and no error.

**Verify RAG is working:**

- Check worker logs for `[agent/chat] AISEARCH failed` or `[knowledge_search] AI Search error` (should be absent for normal queries).
- Check ai_rag_search_history in D1 for recent rows after a few queries.
- If you have a known document in the index, run a query that targets it and confirm it appears in matches or in the model’s answer.

**Detect if RAG is broken:**

- Users report “no context” or generic answers in Agent mode for knowledge questions.
- `/api/agent/rag/query` returns 500 or empty matches for queries that previously returned content.
- knowledge_search tool returns an error or empty results for the same queries.
- Logs show AISEARCH/knowledge_search errors or fallback Vectorize path always used (may indicate AutoRAG unreachable or misconfigured).

---

## Migration execution checklist

**Data flow:** Worker uses `env.AI.autorag('iam-autorag')` (Workers AI API). The `[[ai_search]]` binding in wrangler is unused; migration is a string change only. **iam-platform** bucket stays for memory, daily logs, and conversation summaries. **autorag** bucket (or the AI Search backend you attach to `iam-autorag`) is indexed by Cloudflare; the worker never reads from it directly.

**Execute in order:**

1. **Populate autorag bucket** (or the R2 source attached to AI Search instance `iam-autorag`) with knowledge files so the new instance has content. Example keys: `knowledge/architecture/worker-core.md`, `knowledge/features/agent-modes.md`, `knowledge/decisions/token-efficiency.md`, `context/active-priorities.md`. Use your own script or Cloudflare dashboard.
2. **Trigger reindex** in AI Search dashboard for instance `iam-autorag`. Wait until indexed doc/vector counts look correct and errors = 0.
3. **Worker code (DONE):** All 6 call sites in worker.js now use `'iam-autorag'` (lines 884, 885, 1958, 3712, 4467, 5300). Comment at 6233 updated to reference iam-autorag.
4. **Deploy:** `npm run deploy` (only after you type **deploy approved**).
5. **Test all 5 RAG paths:** (1) Agent mode chat with a knowledge question, (2) knowledge_search tool from dashboard/MCP, (3) dashboard global search, (4) agent.html search box suggestions, (5) POST /api/search if used.
6. **Verify:** No `[agent/chat] AISEARCH failed` or `[knowledge_search] AI Search error` in logs; ai_rag_search_history has new rows; Agent mode replies use platform context.

**Rollback:** In worker.js replace `'iam-autorag'` with `'inneranimalmedia-aisearch'` (7 occurrences), redeploy. Old instance is unchanged.

---

## Summary

- **6 invocations** of `env.AI.autorag('iam-autorag')` in worker.js (5 logical call sites: /api/search x2, runToolLoop, chat, /api/agent/rag/query, invokeMcpToolFromChat). Code updated 2026-03-18.
- RAG is used in **Agent** mode chat (pre-inject), in **knowledge_search** (runToolLoop + invokeMcpToolFromChat), and in **/api/search** and **/api/agent/rag/query**. One Vectorize+R2 fallback exists when AutoRAG returns 0 in invokeMcpToolFromChat.
- **Knowledge storage:** R2 iam-platform (memory/knowledge/conversations), D1 (agent_memory_index, ai_knowledge_base, ai_compiled_context_cache, ai_rag_search_history), Vectorize index. **iam-platform remains required** for conversation history and daily logs; only retrieval uses iam-autorag.
- **Migration:** Instance name updated to iam-autorag in all 6 call sites and comment at 6233. Populate and reindex the iam-autorag instance, then deploy and test the 5 RAG paths.
