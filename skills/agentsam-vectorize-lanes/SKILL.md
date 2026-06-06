---
name: agentsam-vectorize-lanes
description: "Use for ANY Inner Animal Media RAG, Vectorize, pgvector, or embedding work — lane choice, ingest scripts, Supabase agentsam tables, CF Vectorize bindings, D1 vectorize_sync_log receipts, Layer 0 live context (agentsam_project_context, agentsam_context_digest), skills/knowledge maintenance on inneranimalmedia-autorag. Covers the six AGENTSAM_VECTORIZE_* production lanes (1536 text + Gemini media), deep archive (3072 Supabase-only), codebase reindex, documents ingest from R2, and runtime query via semantic-retrieval-dispatch. Do NOT use for legacy 1024-d Managed AI Search (VECTORIZE / ai-search-* indexes) or public.documents — those are retired for Agent Sam chat. Supersedes skills/agentsam-dual-vectorize-lanes."
license: Proprietary. Inner Animal Media platform law.
---

# Agent Sam Vectorize Lanes — End-to-End Architecture

**STOP.** Pretraining about IAM RAG is likely wrong. Prefer this skill + live D1 registry over memory.

**Supersedes:** `skills/agentsam-dual-vectorize-lanes/` (1024 vs 1536 split is legacy; migration 535 retired that router).

**Code truth:** `src/core/rag-lanes.js` · `src/core/semantic-retrieval-dispatch.js` · `docs/platform/bindings-vectorize-api-map-2026-06.md`

---

## Layer 0 — D1 live context (not Vectorize)

**Layer 0 sits above the vector stack.** These tables live in D1 `inneranimalmedia-business`. They shape **what Sam sees every turn** via direct system-prompt injection or message hydration — **without** an embed → query step.

They are **not** substitutes for Vectorize lanes. They are **curated / compressed live state**. Vectorize lanes are **searchable durable corpus**.

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 0 — D1 LIVE CONTEXT (prompt inject, no semantic search)   │
│  agentsam_project_context  → ## Active Projects                 │
│  agentsam_context_digest   → ## Workspace Context / prior summary │
│  (+ agentsam_compaction_events ledger — observability only)     │
├─────────────────────────────────────────────────────────────────┤
│ LAYERS 1–5 — corpus → ingest → pgvector → Vectorize → query    │
│  (see sections below)                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Layer 0 vs Vectorize — when to use which

| Need | Use Layer 0 (D1) | Use Vectorize lane |
|------|------------------|-------------------|
| “What is the platform master brief right now?” | `agentsam_project_context` | — |
| “What did we decide in this long session?” | `agentsam_context_digest` + R2 body | Optional recall via docs `compaction_digest` |
| “Where is X implemented in the repo?” | Pointers in `key_files` column only | **`code_semantic_search`** |
| “What does migration 587 do?” | — | **`schema_semantic_search`** or **`docs_knowledge_search`** |
| “Remember user prefers no emojis” | — | **`memory_semantic_search`** (`writeMemoryLane`) |
| Golden architecture law | — | **`deep_archive_search`** (3072, Supabase only) |

**Duplication risk:** The same facts can appear in project context, session digest, chat messages, *and* RAG hits. Prefer **one authoritative home**: stable platform law → deep archive or project context; session-specific → digest; searchable corpus → Vectorize.

---

### `agentsam_project_context` — workspace project brief

**Purpose:** Structured **active project** record — goals, constraints, blockers, wiring hints (`primary_tables`, `workers_involved`, `key_files`, `related_routes`).

**Canonical row (ws_inneranimalmedia):**

| Field | Value |
|-------|-------|
| `id` | **`ctx_inneranimalmedia`** |
| `project_key` | **`inneranimalmedia`** (matches Worker name) |
| `project_name` | `inneranimalmedia Worker — Platform Master` |
| `status` | `active` (exactly **one** active row per workspace) |
| `priority` | `100` |

**Naming law:** `id = ctx_{worker_name}` · `project_key = {worker_name}`. Do **not** use legacy abbreviations (`iam-platform`, `ctx_iam_platform` — archived migration **587**).

**Runtime path:**

```
buildSystemPrompt()
  → appendActiveProjectsToSystemPrompt()     [src/core/agent-prompt-context.js]
  → SELECT … FROM agentsam_project_context
       WHERE status = 'active' AND workspace_id = ?
       AND project_type NOT IN ('bootstrap_cache')
       AND project_key NOT IN ('agent_bootstrap')
       ORDER BY priority DESC LIMIT 3
  → appends ## Active Projects to system prompt
```

**Other uses of the same table (different rows):**

| `project_key` / `project_type` | Role | In ## Active Projects? |
|--------------------------------|------|------------------------|
| `inneranimalmedia` / `platform_master` | Canonical platform brief | **Yes** (when active) |
| `agent_bootstrap` / `bootstrap_cache` | GET `/api/agent/bootstrap` JSON cache in `notes` | **No** (filtered) |
| Historical seeds (learn, viz, deploy, …) | Backlog snapshots | **No** (archive with `status='archived'`) |

**Maintenance:**

```sql
-- Verify single canonical active row
SELECT id, project_key, status, priority
FROM agentsam_project_context
WHERE workspace_id = 'ws_inneranimalmedia' AND status = 'active';

-- Update platform brief (edit description/goals/constraints/key_files — keep id stable)
UPDATE agentsam_project_context
SET description = ?, goals = ?, constraints = ?, updated_at = unixepoch()
WHERE id = 'ctx_inneranimalmedia';
```

Apply structural changes via idempotent migration (pattern: `migrations/587_project_context_canonical_inneranimalmedia.sql`).

**Vectorize:** Not auto-embedded. Optional future: `writeToLane('docs', { source_type: 'project_context', source_ref: project_key, … })` — not production today.

---

### `agentsam_context_digest` — compaction index + optional RAG bridge

**Purpose:** Ledger for **compressed session context** — hashes, token/size stats, and either **inline summary text** or an **R2 pointer** to the full body.

**Not the same as `vectorize_sync_log`:** digest = live/compaction context; sync_log = ingest job receipts (`run:*`, `r2:*`, `skill:*`).

#### `digest_type` and `digest_text` semantics (critical)

| `digest_type` | Written by | `digest_text` contains | Read path |
|---------------|------------|------------------------|-----------|
| **`session`** | `cicd-event.js` (session end), `hook-dispatcher` (`context_load`) | **Inline markdown** | `buildSystemPrompt` → `## Workspace Context` |
| **`conversation`** | `conversation-compaction.js` (`/compact`, auto-compact) | **R2 key** `context/{userId}/{wsId}/{convId}/digest_*.json` | `hydrateMessagesWithPriorDigest` → `[Prior context summary]` on next turn |
| handoff | `agent-handoff.js` | Handoff prose | Handoff flow |

**R2 body store:** `inneranimalmedia-autorag` via `AUTORAG_BUCKET` — `src/core/r2-context-store.js`. Never write compaction artifacts to `env.R2` / dashboard bucket.

#### Compaction side-effect chain (conversation → Vectorize)

When `/compact` or auto-compaction fires (`src/core/conversation-compaction.js`):

```
1. LLM summarize old turns (gpt-4.1-mini)
2. R2 put  → context/{user}/{ws}/{conv}/digest_{ts}.json
3. D1 row  → agentsam_context_digest (digest_type=conversation, digest_text=r2Key)
4. D1 row  → agentsam_compaction_events (runtime ledger — NOT ingest)
5. D1 update → agentsam_chat_sessions.latest_digest_r2_key
6. Supabase + Vectorize → writeToLane('docs', source_type=compaction_digest, source_ref=conversationId)
```

Step 6 is the **only Layer 0 → Vectorize bridge**: searchable session summaries land in **`agentsam_documents_oai3large_1536`** / **`AGENTSAM_VECTORIZE_DOCUMENTS`**, not in project context.

**Prompt injection gaps to know:**

- `## Workspace Context` only loads latest **`digest_type = 'session'`** with inline text.
- **`conversation`** digests hydrate **message list**, not the workspace block — unless you read R2 in prompt builder (not done today).

**Maintenance / verify:**

```sql
-- Recent digests
SELECT id, digest_type, substr(digest_text,1,80) AS digest_preview,
       token_count, generation_model, created_at
FROM agentsam_context_digest
WHERE workspace_id = 'ws_inneranimalmedia'
ORDER BY created_at DESC LIMIT 10;

-- Compaction ledger (runtime, not vector ingest)
SELECT compaction_strategy, tokens_before, tokens_after, compacted_at
FROM agentsam_compaction_events
ORDER BY compacted_at DESC LIMIT 10;
```

```bash
# User-triggered compact (also indexes to docs lane)
# In chat: /compact
# API: agentsam_commands router_type=in_app, tool_key=thread.compact
```

---

### Layer 0 control-plane neighbors (do not confuse)

| Table | Layer | Role |
|-------|-------|------|
| `agentsam_rules_document` | 0-adjacent | Always-on platform law in system prompt (`apply_mode=always`) |
| `agentsam_prompt_routes` | 0-adjacent | Gates `include_rag`, `include_workspace_ctx`, token budgets per route |
| `agentsam_compaction_events` | 0-adjacent | **Runtime** compaction audit — not batch embed evidence |
| `vectorize_sync_log` | 2-receipt | Ingest script receipts — **not** session digests |
| `agentsam_memory` | operational KV | Structured memory keys — pair with **memory Vectorize lane** for recall |

Full compaction map: `docs/platform/context-embedding-compaction-map-2026-06.md`

---

### Layer 0 maintenance checklist

**Project context**

1. One **`status='active'`** row per workspace; canonical id **`ctx_inneranimalmedia`** for main worker.
2. Archive stale seeds (`status='archived'`, `priority=0`) — never leave 50+ active rows.
3. Keep `workers_involved`, `primary_tables`, `key_files` as **pointers** to Vectorize/search lanes, not copy-paste of full docs.
4. Migration **587** applied — retire references to `ctx_iam_platform` in new docs/seeds.

**Context digest**

1. After changing compaction behavior, verify R2 keys under `context/` resolve via `readContextFromR2`.
2. Optionally embed **`session`** digests to docs lane (today only **`conversation`** path calls `writeToLane`).
3. Unify `digest_text` semantics long-term: always R2 pointer + optional inline column (design debt).

**When editing this skill**

```bash
./scripts/upload-iam-skills-autorag.sh
./scripts/with-cloudflare-env.sh node scripts/ingest_repo_skills_rag.mjs --only agentsam-vectorize-lanes
```

---

## Mental model — layers 1–5 (corpus → query)

```
┌─────────────────────────────────────────────────────────────────┐
│ 5. RUNTIME QUERY (Worker hot path)                              │
│    embed query → Vectorize.query → hydrate full text via        │
│    Hyperdrive pgvector fallback if zero hits                    │
├─────────────────────────────────────────────────────────────────┤
│ 4. CLOUDFLARE VECTORIZE (edge ANN indexes, 1536 cosine)         │
│    AGENTSAM_VECTORIZE_* bindings · vector id = Supabase UUID    │
├─────────────────────────────────────────────────────────────────┤
│ 3. SUPABASE pgvector (agentsam schema — canonical text + embed) │
│    Full chunk body, content_hash dedup, workspace UUID scope    │
├─────────────────────────────────────────────────────────────────┤
│ 2. INGEST / SYNC (offline Node scripts, OpenAI/Gemini embed)    │
│    reindex_codebase · ingest_r2_to_rag · rag_ingest · skills    │
├─────────────────────────────────────────────────────────────────┤
│ 1. SOURCE CORPUS (R2 autorag + git repo — NOT vectors)          │
│    skills/*/SKILL.md · knowledge/ · recipes/ · repo source files│
└─────────────────────────────────────────────────────────────────┘

     D1 control plane (broader than Layer 0):
     agentsam_tools · agentsam_skill · vectorize_sync_log · agentsam_prompt_routes
     Layer 0 tables above are LIVE PROMPT context — not vector stores
```

**Golden law:** One index · one dimension · one embedding model per lane. Never mix vectors across indexes.

**Dual-write pattern:** Write Supabase first (full text + embedding), then upsert Vectorize with the **same row UUID** as vector `id`. Runtime queries Vectorize for speed, Postgres for hydration and fallback.

---

## Production lanes (2026-06)

| Lane | Worker binding | CF Vectorize index | Supabase table | Semantic tool | Embed model | Dims |
|------|----------------|-------------------|----------------|---------------|-------------|------|
| **code** | `AGENTSAM_VECTORIZE_CODE` | `agentsam-codebase-oai3large-1536` | `agentsam_codebase_chunks_oai3large_1536` (+ files catalog) | `code_semantic_search` | OpenAI `text-embedding-3-large` | 1536 |
| **docs** | `AGENTSAM_VECTORIZE_DOCUMENTS` | `agentsam-documents-oai3large-1536` | `agentsam_documents_oai3large_1536` | `docs_knowledge_search` | OpenAI `text-embedding-3-large` | 1536 |
| **schema** | `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` | `agentsam_database_schema_oai3large_1536` | `schema_semantic_search` | OpenAI `text-embedding-3-large` | 1536 |
| **memory** | `AGENTSAM_VECTORIZE_MEMORY` | `agentsam-memory-oai3large-1536` | `agentsam_memory_oai3large_1536` | `memory_semantic_search` | OpenAI `text-embedding-3-large` | 1536 |
| **media** | `AGENTSAM_VECTORIZE_MEDIA` | `agentsam-moviemode-gemini2-1536` | `agentsam_media_gemini2_1536` | `media_semantic_search` | **Gemini `gemini-embedding-2`** | 1536 |
| **archive** | *(none)* | *(none)* | `agentsam_deep_archive_oai3large_3072` | `deep_archive_search` | OpenAI `text-embedding-3-large` @ full dims | **3072** |
| courses | `AGENTSAM_VECTORIZE_COURSES` | `agentsam-courses-oai3large-1536` | *(CF-only LMS catalog)* | — | OpenAI 1536 | 1536 |

**Schema rule:** All agent RAG tables live in **`agentsam.*`** — never `public.agentsam_*`.

**Legacy (read-only, do not insert):** `agentsam_schema_oai3large_1536` (9 rows) — use `agentsam_database_schema_oai3large_1536`.

---

## Runtime query path

```
User message / tool call
  → createAgentsamEmbedding()  (OpenAI 1536, src/core/agentsam-vectorize.js)
  → env.AGENTSAM_VECTORIZE_{LANE}.query(embedding, { filter: { workspace_id: ws_* } })
  → match.metadata → source_ref / file_path / memory_key
  → Hyperdrive SELECT full content FROM agentsam.{table}
  → if zero Vectorize hits: pgvector cosine fallback on same table
  → prompt section (## Code semantic context, etc.)
```

**Workspace scoping:**

- Vectorize metadata filter: D1 workspace **key** (`ws_inneranimalmedia`)
- Supabase rows: workspace **UUID** (`resolveSupabaseWorkspaceId()` in `rag-lanes.js`)

**Route-aware RAG** (`queryRouteRagLanes`): `ask` / `research` → docs + memory; `db_*` / `debug` / `cf_ops` → schema + memory.

---

## Layer 1 — Source corpus (R2 + git)

Bucket: **`inneranimalmedia-autorag`**

| Prefix | Role | Vectorized? |
|--------|------|-------------|
| `skills/{name}/SKILL.md` | Runtime skill hydration (`retrieval_strategy=r2` in D1) | Optional — also embed to docs lane for semantic search |
| `skills/{name}/references/*.md` | Deep reference docs (e.g. `agents-sdk/references/`) | Yes — via `ingest_r2_to_rag.mjs --batch=skills` |
| `knowledge/agentsam/**` | Platform audits, architecture notes | Yes — `--batch=audit` |
| `recipes/**` | Operational recipes | Yes — `--batch=recipes` |
| `scripts/{lane}/` | Runnable script catalog (AutoRAG discovery) | No — D1 `agentsam_scripts` registry |

**Repo mirror:** `skills/*/SKILL.md` in git is canonical; upload with `./scripts/upload-iam-skills-autorag.sh` → R2 `skills/{name}/SKILL.md`.

**Skills on R2 that are NOT vectorized** still load at chat time when D1 `agentsam_skill.retrieval_strategy = 'r2'`. Vectorizing adds **fast semantic search** (`docs_knowledge_search`) without replacing runtime hydration.

---

## Layer 2 — Ingest scripts (when to run what)

| Content changed | Script | Target lane | D1 receipt |
|-----------------|--------|-------------|------------|
| Dashboard/agent source files (171-file list) | `node scripts/reindex_codebase_dashboard_agent.mjs` | **code** | One row: `run:reindex_codebase_dashboard_agent` |
| R2 `knowledge/`, `recipes/`, `skills/cloudflare/references/` | `node scripts/ingest_r2_to_rag.mjs` | **docs** | One row per file: `r2:{r2_key}` |
| Repo `skills/*/SKILL.md` | `node scripts/ingest_repo_skills_rag.mjs` | **docs** | Per skill ingest |
| Golden platform docs (`docs/platform/*.md`) | `node scripts/rag_ingest.mjs --lane deep_archive` | **archive** (3072) | Via rag_ingest registry |
| Full lane sync after Supabase drift | `node scripts/rag_ingest.mjs --lane all --update-registry` | all bound lanes | Registry update |
| Orchestrator (R2 upload + golden + skills) | `./scripts/embed-golden-and-skills.sh` | multi | — |

**Env (all ingest scripts):** `OPENAI_API_KEY`, `SUPABASE_DB_URL` (direct Postgres, not Hyperdrive), `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

**Always dry-run first:**

```bash
./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --dry-run
./scripts/with-cloudflare-env.sh node scripts/ingest_r2_to_rag.mjs --dry-run
```

**Dedup:** Reindex skips files when Supabase `content_hash` matches. `ingest_r2_to_rag` skips when hash unchanged. Safe to re-run after 503 blips.

**vectorize_sync_log (D1):** Coarse receipts only — NOT per-chunk UUIDs. Always set `vectorize_index` explicitly (no default; migration 585).

---

## Layer 3 — Supabase pgvector (`agentsam` schema)

**Connection:** Worker uses `env.HYPERDRIVE` at runtime. Ingest scripts use `SUPABASE_DB_URL` direct.

| Table | Dedup key | Chunk strategy |
|-------|-----------|----------------|
| `agentsam_codebase_files_oai3large_1536` | `workspace_id + file_path` | File catalog (no embedding) |
| `agentsam_codebase_chunks_oai3large_1536` | per file reindex | AST-ish blocks, 10–400 tokens |
| `agentsam_documents_oai3large_1536` | `content_hash` / slug | H2 sections, `heading_path[]` |
| `agentsam_database_schema_oai3large_1536` | object descriptors | Schema/migration atoms |
| `agentsam_memory_oai3large_1536` | `memory_key` | Stable facts (not raw chat) |
| `agentsam_deep_archive_oai3large_3072` | `content_hash` | Golden law — full 3072-d embed, **no Vectorize mirror** |

**Operational memory (non-vector):** `agentsam_memory` — structured KV; separate from `agentsam_memory_oai3large_1536` retrieval lane.

---

## Layer 4 — Cloudflare Vectorize

**Upsert shape (REST v2 NDJSON):**

```json
{ "id": "<supabase_uuid>", "values": [1536 floats], "metadata": { "workspace_id": "ws_inneranimalmedia", "file_path": "...", "chunk_index": 0 } }
```

**Bindings:** Declared in `wrangler.production.toml` — verify with `npm run verify:wrangler-production`.

**Propagation:** ~5–10s after upsert before queries return new vectors.

**Describe / ops:** `GET /api/internal/agentsam-vectorize/describe`

---

## Layer 5 — Runtime (Worker)

| Component | File |
|-----------|------|
| Lane config | `src/core/rag-lanes.js` |
| Semantic dispatch | `src/core/semantic-retrieval-dispatch.js` |
| Chat pre-context | `src/core/agent-chat-lane-context.js` |
| Tool executor | `src/core/catalog-tool-executor.js` |
| Lane writes (chat) | `writeMemoryLane()`, `writeToLane()` in `rag-lanes.js` |

**Not used for Agent Sam chat:** `POST /api/search` (1024-d legacy AutoRAG), `env.VECTORIZE`, `env.AGENTSAMVECTORIZE`, `public.documents`.

---

## Three retrieval surfaces (do not conflate)

| Surface | Purpose | Maintenance |
|---------|---------|-------------|
| **R2 skills** | Full SKILL.md at plan/slash time | Edit git → `upload-iam-skills-autorag.sh` |
| **Documents Vectorize (1536)** | Fast semantic search over docs/skills/knowledge | `ingest_repo_skills_rag.mjs` / `ingest_r2_to_rag.mjs` |
| **Deep archive (3072)** | Long architecture truth, golden platform law | `rag_ingest.mjs --lane deep_archive` |

Editing a skill like `agents-sdk/SKILL.md` on R2 without re-ingesting leaves **runtime text fresh** but **search index stale** until you run documents ingest.

---

## Maintenance checklist

### After editing repo skills (`skills/*/SKILL.md`)

```bash
./scripts/upload-iam-skills-autorag.sh                    # R2 runtime
./scripts/with-cloudflare-env.sh node scripts/ingest_repo_skills_rag.mjs --only {skill-name}
```

### After editing dashboard/agent code (171-file manifest)

```bash
./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs
```

### After adding R2 knowledge / recipes / CF reference docs

```bash
./scripts/with-cloudflare-env.sh node scripts/ingest_r2_to_rag.mjs --batch=audit   # or recipes | skills
```

### After golden platform doc changes

```bash
./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane deep_archive
```

### After any Supabase embed drift (Vectorize out of sync)

```bash
./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane all --update-registry
```

### Register new operator scripts on autorag

```bash
# Add entry to scripts/upload-agentsam-scripts-r2.sh TIER1_MANIFEST
./scripts/upload-agentsam-scripts-r2.sh
# D1 migration for agentsam_scripts row if new slug
```

---

## R2 skills folder layout (reference pattern)

Mirrors Cloudflare upstream skills (e.g. `agents-sdk/`):

```
skills/{skill-name}/
  SKILL.md              ← frontmatter + instructions (load at runtime)
  references/           ← optional deep docs (vectorize to documents lane)
    topic-a.md
    topic-b.md
```

Public URL pattern: `https://rag.inneranimalmedia.com/skills/{name}/SKILL.md`

**This skill lives at:** `skills/agentsam-vectorize-lanes/SKILL.md`

---

## Verify before embed or query

1. **Binding → index → table** row exists in `docs/platform/bindings-vectorize-api-map-2026-06.md`
2. **Dimensions:** 1536 for all text lanes; 3072 only for deep archive; Gemini only for media
3. **D1:** `SELECT chunk_id, vectorize_index, synced_at FROM vectorize_sync_log ORDER BY synced_at DESC LIMIT 20`
4. **Supabase row counts:** query via Hyperdrive or `scripts/verify-supabase-pg.mjs`
5. **Never** write OpenAI 1536 vectors into Gemini media index or 3072 archive table

---

## Related docs

| Doc | Path |
|-----|------|
| Bindings map | `docs/platform/bindings-vectorize-api-map-2026-06.md` |
| Embedding pipeline | `docs/platform/embedding-pipeline-2026-06.md` |
| Compaction + routing | `docs/platform/context-embedding-compaction-map-2026-06.md` |
| Supabase schema law | `.cursor/rules/iam-supabase-agentsam-schema.mdc` |
| RAG lane columns | `docs/supabase/AGENTSAM_RAG_LANE_SCHEMA_REFERENCE.md` |

---

## Quick command reference

```bash
# Codebase lane (171 dashboard/agent files) — COMPLETE as of 2026-06-06
./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs

# Documents lane from autorag R2 (not yet run unless operator executed)
./scripts/with-cloudflare-env.sh node scripts/ingest_r2_to_rag.mjs

# Full embed pipeline
./scripts/embed-golden-and-skills.sh

# Upload this skill to R2 after editing
./scripts/upload-iam-skills-autorag.sh skills/agentsam-vectorize-lanes/SKILL.md
./scripts/with-cloudflare-env.sh node scripts/ingest_repo_skills_rag.mjs --only agentsam-vectorize-lanes
```
