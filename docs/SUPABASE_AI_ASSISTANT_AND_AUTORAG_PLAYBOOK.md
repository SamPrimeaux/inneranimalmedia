# Supabase AI assistant brief + AutoRAG / documentation playbook

Two-part guide: **Part 1** is written so it can be pasted into or adapted for a Supabase-hosted AI assistant (custom instructions, agent prompt, or ops runbook). **Part 2** is what the codebase / Cloudflare Worker side must implement for end-to-end, industry-standard documenting and semantic retrieval.

---

## Part 1 — Instructions for the AI assistant (Supabase scope)

You operate against **project Postgres + pgvector** as the **semantic layer** beside **Cloudflare D1** (operational edge). Your role is to reason about **data quality, retrieval correctness, multi-tenant isolation, observability, and schema evolution**—not to replace D1 as the system of record for live app traffic.

### 1.1 What you must always verify

When answering questions or proposing changes, ground checks in:

| Area | What to look for |
|------|-------------------|
| **Identity scope** | Every retrieval path uses **`tenant_id`**, **`workspace_id`**, and **`project_id`** where tables define them. No cross-tenant or cross-workspace leakage in `WHERE` / RPC args. |
| **Embedding consistency** | Rows in `public.documents` and `agent_memory` store vectors generated with a **documented** `embed_model`. Flag any mix of models in the same logical index without explicit separation. |
| **RPC vs ad-hoc SQL** | Prefer existing functions: `match_documents`, `search_all_context`, `search_agent_memory`, `match_codebase_chunks`, `match_session_summaries`, etc. Flag raw `embedding <=> $1` in application code when RPCs already encode thresholds and filters. |
| **Thresholds** | `match_threshold` defaults (e.g. 0.7) should align with logged behavior in **`semantic_search_log`** (`top_similarity`, `avg_similarity`). Recommend tuning when logs show systematic low scores or zero-hit queries. |
| **Indexes** | Confirm **pgvector** indexes exist on `embedding` columns used at scale; note **vacuum/analyze** and **index type** (HNSW vs IVFFlat) when latency or recall degrades. |
| **Analytics tables** | **`semantic_search_log`** should receive writes for production search paths; sparse logs mean observability is incomplete. **`agentsam_*`** eval/routing/prompt tables empty → recommend wiring write paths or cron evals. |
| **Codebase intelligence** | If **`codebase_chunks`** / **`codebase_files`** are empty while **`documents`** is full, semantic search is **doc-heavy** but **repo-blind**—call out the gap for implementation tasks (“where is this route defined?”). |

### 1.2 What you should recommend (standard behaviors)

1. **Scoped retrieval** — Always suggest filters: `tenant_id`, `workspace_id`, optional `filter_source` / source prefix (`docs:*`, `d1:*`, etc.) when matching `documents`.
2. **Hybrid where available** — When keyword precision matters (routes, symbols), align with functions that combine lexical + vector (e.g. `search_agent_memory`-style patterns) if present in schema.
3. **Logging** — Every semantic query in production should log: query preview, threshold, counts returned, top/avg similarity, latency, sources hit, session/tenant correlation when possible.
4. **Eval loop** — Tie low-quality search sessions to **`agentsam_eval_*`** or golden-query suites; never treat static thresholds as permanent.
5. **Data lifecycle** — Old snapshots (`codebase_snapshots`), duplicate chunks, or superseded embed models should be versioned or purged with explicit policy—not silent drift.

### 1.3 What you must not assume

- **Supabase is not the primary OLTP store** for Worker hot paths; D1 holds operational truth for sessions, routes, commands, etc.
- **High row counts in `agent_memory`** do not imply search quality; validate with **`semantic_search_log`** and user-facing relevance.
- **Empty auxiliary tables** (`codebase_chunks`, sparse eval logs) mean **pipeline or instrumentation gaps**, not “unused schema.”

### 1.4 Deliverable style when advising humans

- State **which table/RPC** applies, **which filters are mandatory**, and **what empty or skewed data implies**.
- Prefer **measurable** recommendations (thresholds from logs, index DDL, migration sketches) over generic “improve RAG.”

### 1.5 `semantic_search_log` — tenant RLS + JWT (production)

Custom Access Token hook puts **`tenant_id` in `claims.app_metadata`** (`src/api/auth-hooks.js`). **Do not** use `auth.jwt() ->> 'tenant_id'` (top-level) in policies.

| Item | Detail |
|------|--------|
| **Tenant claim in RLS** | `(select auth.jwt() -> 'app_metadata' ->> 'tenant_id')` compared to **`semantic_search_log.tenant_id`** (**text**). Fail-closed: claim **`IS NOT NULL`** AND equality. |
| **Policies** | **`semantic_search_log_authenticated_select`** / **`semantic_search_log_authenticated_insert`** on **`authenticated`**; existing **`service_role_all`** unchanged for **`service_role`**. |
| **`anon`** | **`REVOKE ALL`** on this table (was overly granted). |
| **`authenticated` table privs** | **`DELETE`/`UPDATE`/`TRUNCATE`** revoked — append-only via privilege layer; no UPDATE/DELETE RLS policies needed for JWT clients. |
| **`log_semantic_search` RPC** | **`SECURITY INVOKER`** (not definer); **`EXECUTE`** granted to **`authenticated`** + **`service_role`** only (**`PUBLIC`** revoked). |
| **Validate policies** | Run queries **as a real user JWT** (app or dashboard “run as user”) — not bare `auth.jwt()` snippets in the SQL editor. |

Remote migrations: **`semantic_search_log_rls_app_metadata_tenant`**, **`log_semantic_search_revoke_public_execute`**.

---

## Part 2 — Codebase / Cloudflare Worker side (industry-standard documenting & AutoRAG)

This is what **your repo and Worker** should implement so Supabase stays the durable **vector + analytics brain** while D1 stays the **edge ops** layer—matching common production RAG patterns (ingest → chunk → embed → index → retrieve → log → evaluate).

### 2.1 Ingestion pipeline (documenting)

| Layer | Industry-standard practice | Your alignment |
|-------|----------------------------|----------------|
| **Sources** | Single list of allowed sources (Git repo paths, D1 exports, markdown docs, CMS exports). | Continue D1/docs/route-map → Supabase; add explicit **source registry** in code or DB. |
| **Chunking** | Stable chunk size + overlap; deterministic IDs (hash of source + offset) for idempotent upserts. | Ensure ingest scripts chunk consistently; store `source`, `title`, `metadata` (path, sha, chunk index). |
| **Embedding** | **One canonical model per index column** (or separate columns / tables per model). | Align Workers AI / OpenAI paths with `documents.embed_model` and avoid mixing `bge-base` vs `bge-large` in the same vector column without labeling. |
| **Upsert** | Upsert on `(project_id, source, chunk key)` or equivalent to avoid duplicates on re-ingest. | Match `rag.js` / ingest jobs to `public.documents` constraints. |
| **Freshness** | Re-embed or delete stale chunks when source changes (commit SHA, file mtime). | Tie **`codebase_snapshots`** and ingest cron to git SHA or artifact version. |

### 2.2 Retrieval (AutoRAG / semantic search)

| Layer | Industry-standard practice | Your alignment |
|-------|----------------------------|----------------|
| **Entry point** | Single RPC or service function per use case (`match_documents` vs `search_all_context`). | Consolidate Worker/Hyperdrive paths to call **Postgres functions**, not duplicate similarity SQL everywhere. |
| **Filters** | Mandatory tenant/workspace/project in every path. | Pass through from session / identity resolution (D1/auth), never hardcode IDs in Worker. |
| **Safety** | Threshold + max rows + timeout on Hyperdrive/pg. | Keep server-side limits; avoid unbounded `LIMIT`. |
| **Hybrid** | Keyword + vector for code and named entities where RPC supports it. | Use schema-native hybrid where available; extend RPCs if needed. |

### 2.3 Observability & quality (close the loop)

| Layer | Industry-standard practice | Your alignment |
|-------|----------------------------|----------------|
| **Search logs** | Insert **`semantic_search_log`** on every production retrieval with latency and similarity stats. | Wire Agent chat RAG, unified-search, and batch jobs to log consistently. |
| **Prompt/run tracing** | Link retrieval → assembled context → model call (prompt run IDs). | Populate **`agentsam_prompt_runs`** / routing tables where missing. |
| **Evals** | Scheduled golden-query runs; regression on embedding or threshold changes. | Use **`agentsam_eval_*`** tables + CI or cron smoke tests. |
| **Cost/latency** | Track tokens and wall time per query class. | Correlate with existing spend/telemetry patterns (D1 rollups + Supabase analytics). |

### 2.4 Codebase semantic layer (complete the scaffold)

| Gap | What to build in codebase |
|-----|---------------------------|
| **`codebase_files` / `codebase_chunks` empty** | Extend existing **codebase index sync** (queue/cron) to: list files → chunk → embed → upsert chunks; attach **`codebase_snapshots`** commit ID. |
| **Repo Q&A** | Route “where is X defined?” to **`match_codebase_chunks`** / **`search_codebase_symbols`** before falling back to generic `documents`. |

### 2.5 Operational checklist (Worker + migrations)

- [ ] **Hyperdrive + secrets**: Production `HYPERDRIVE`, `AI`, model secrets documented; no secrets in repo.
- [ ] **Migrations**: Schema changes via versioned SQL; pgvector indexes created/rebuilt after bulk load.
- [ ] **Cron**: Scheduled re-ingest or incremental sync + retention for old snapshots/logs per policy.
- [ ] **Monitoring**: Alerts on Hyperdrive errors, zero-hit search spikes, or embedding API failures.

### 2.6 Summary split (mental model)

| System | Role |
|--------|------|
| **D1 / CF** | Operational edge: auth/session mirrors, routes, commands, worker state, fast dashboard reads/writes. |
| **Supabase Postgres** | Semantic memory, vectors, search logs, evals, analytics warehouse, multi-tenant context. |
| **R2** | Large artifacts, exports, optional raw doc blobs. |
| **Workers / DO** | Runtime, orchestration, embedding calls, Hyperdrive queries, queue processors. |

---

*Part 1 can be copied into Supabase AI / internal ops prompts; Part 2 drives engineering backlog and PR scope for AutoRAG and documentation pipelines.*
