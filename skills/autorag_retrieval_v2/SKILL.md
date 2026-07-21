---
name: rag-pathway-guide
description: >-
  Decide which IAM retrieval pathway to use: Layer 0 D1 context, Vectorize/pgvector
  lanes (code/docs/schema/memory/media/archive), AST-RAG agentsam_codebase_retrieve,
  R2 AutoRAG corpus, or legacy AI Search. Use when searching knowledge, memory,
  schema, codebase, or when /rag /autorag /vectorize-lanes /ast-rag-index conflict.
---

# RAG pathway guide (Agent Sam)

**STOP.** Do not default to `POST /api/rag/search` or invent one “AutoRAG” blob. Pick a pathway.

Workspace for this skill registry: **`ws_inneranimalmedia`** · tenant **`tenant_sam_primeaux`**.  
Customer tenants: resolve their `workspace_id` / Supabase UUID — never search platform lanes as if they were the customer.

Deep ingest/bindings law → **`skill_agentsam_vectorize_lanes`** (`/vectorize-lanes`).  
AST index refresh → **`skill_ast_rag_codebase_index`** (`/ast-rag-index`).  
R2 file manifest lookup → **`skill_autorag_retrieval`** (D1 `autorag` table + HTTP/R2 fetch).

---

## When to search at all

**Do:** missing IAM-specific fact, table/route/binding, past decision, “where is X implemented”, schema shape, durable preference.  
**Don’t:** answer already in thread; generic non-IAM; same query already this turn; &lt;3 meaningful words.

Query style: noun phrases — `"agent_run finalize waitUntil"` not `"how do we finalize runs?"`.

---

## Pathway picker

| Need | Pathway | Call | Storage |
|------|---------|------|---------|
| What’s active *right now* (brief, blockers) | **Layer 0** | Already in system prompt; or D1 `agentsam_project_context` / `agentsam_context_digest` | D1 only (no embed) |
| Where is this **symbol/function** + deps | **AST-RAG** | `agentsam_codebase_retrieve` | D1 AST + PG symbols (+ chunk hydrate) |
| Where is this in **repo file chunks** | **code lane** | `code_semantic_search` / semantic dispatch | PG chunks ↔ `AGENTSAM_VECTORIZE_CODE` |
| Skills / knowledge / recipes / platform docs | **docs lane** | `docs_knowledge_search` | PG documents ↔ `AGENTSAM_VECTORIZE_DOCUMENTS` |
| Table / migration / DB shape | **schema lane** | `schema_semantic_search` | PG schema ↔ `AGENTSAM_VECTORIZE_SCHEMA` |
| Durable user/workspace prefs & facts | **memory lane** | `agentsam_memory_search` / `memory_semantic_search` | PG memory ↔ `AGENTSAM_VECTORIZE_MEMORY` |
| MovieMode / multimodal assets | **media lane** | `media_semantic_search` | Gemini 1536 ↔ `AGENTSAM_VECTORIZE_MEDIA` |
| Golden / long-lived architecture law | **deep archive** | `deep_archive_search` | PG **3072 only** (no Vectorize) |
| Exact skill/doc **file** by key/title | **R2 AutoRAG corpus** | D1 `autorag` + `file_url` / `AUTORAG_BUCKET` | R2 `inneranimalmedia-autorag` |
| Dashboard search UI | **Legacy AI Search** | `POST /api/search` | CF Managed Search **1024-d** — **not** Agent chat spine |

**Never mix:** OpenAI-1536 text lanes ↔ Gemini media ↔ 3072 archive.  
**Never confuse:** `code_semantic_search` (chunks) ≠ `agentsam_codebase_retrieve` (AST symbols).

Chat spine uses `dispatchSemanticRetrieval` (`src/core/semantic-retrieval-dispatch.js`), not legacy unified `/api/rag/search` as the primary agent path.

---

## How skills themselves are stored (agentsam_skill)

| Layer | What | Typical |
|-------|------|---------|
| **D1 lightweight** | `agentsam_skill` row: id, name, slash, globs, tags, `file_path`, `metadata_json`, empty or short `content_markdown` | Always |
| **R2 full body** | `inneranimalmedia-autorag/skills/<name>/SKILL.md` | `retrieval_strategy=r2` → hydrate via `agentsam-skill-r2.js` |
| **Docs lane embed** (optional) | Chunk + embed SKILL.md into documents Vectorize/pgvector | `scripts/ingest_repo_skills_rag.mjs` after R2 upload |
| **Inline D1** (legacy/small) | Full markdown in `content_markdown` | Older skills; fine for short bodies |

**Law:** large procedural skills → **R2 body + thin D1 registry** (like `skill_deploy`, this skill). Embed into docs lane when you want semantic *discovery* of the skill text; R2 hydrate is enough for slash/explicit load.

Upload: `./scripts/upload-iam-skills-autorag.sh` then optional ingest.

---

## Slash map

| Slash | Skill | Job |
|-------|-------|-----|
| `/rag` | **this** (`skill_autorag_retrieval_v2`) | Which pathway? |
| `/vectorize-lanes` | `skill_agentsam_vectorize_lanes` | Bindings, ingest, dual-write law |
| `/ast-rag-index` | `skill_ast_rag_codebase_index` | Phase 1/2 refresh + drift |
| `/autorag` | `skill_autorag_retrieval` | R2/D1 `autorag` file lookup |
| `/iam-ship` | `skill_deploy` | Main + MCP ship |

---

## After hits

Cite pathway (“AST-RAG: …”, “docs lane: …”). Scores ~&gt;0.75 strong; &lt;0.5 reformulate or switch pathway. Zero hits → say so; don’t invent. Prefer Layer 0 for live project state over stale vector hits.
