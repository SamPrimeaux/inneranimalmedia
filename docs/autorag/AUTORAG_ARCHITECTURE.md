# AutoRAG Architecture — Overview & Runtime Contracts
## Inner Animal Media / Agent Sam Platform
*Last verified: May 2026 — confirmed live against Supabase + Cloudflare bindings*

---

## What This Document Is

This is the single source of truth for how Agent Sam's retrieval-augmented generation system is structured. It covers every storage lane, every table, every binding, every rule about what goes where and why. If you are Cursor, treat every section marked **RUNTIME CONTRACT** as an immutable constraint — not a suggestion. If you are Sam, this is the document that stops the "wait, which table does this go in?" question from happening at 2am.

---

## The Big Picture

Agent Sam has two retrieval speeds and two embedding sizes. Everything in the system is a consequence of that one decision.

```
FAST LANE (1536 dims)
  Dual-write: Cloudflare Vectorize + Supabase pgvector
  Latency: ~50ms
  Use: hot path retrieval, real-time agent context
  Index type: HNSW (documents) or IVFFlat (memory, codebase)

DEEP LANE (3072 dims)
  Supabase pgvector ONLY — Cloudflare Vectorize cannot handle 3072
  Latency: ~200-400ms
  Use: infrequent, high-precision, complex semantic retrieval
  Index type: HNSW on halfvec(3072) cast — pgvector 0.7+ trick
```

The embedding model for ALL lanes is `text-embedding-3-large`. The dimension is controlled at call time via the `dimensions` parameter. 1536 and 3072 produce different vector spaces — they cannot be mixed in the same index.

---

## The R2 Bucket

**Bucket:** `inneranimalmedia-autorag`
**Worker binding:** `AUTORAG_BUCKET`
**Cloudflare dashboard:** R2 → inneranimalmedia-autorag

### Folder Map

Every folder has an assigned retrieval lane, Supabase table, and (if applicable) Cloudflare Vectorize binding. This mapping is a runtime contract — changing a folder's lane assignment without migrating existing vectors breaks retrieval silently.

| R2 Folder | Lane | CF Vectorize Binding | CF Index | Supabase Table | `source_type` value |
|---|---|---|---|---|---|
| `knowledge/` | 1536 | `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` | `agentsam_schema_oai3large_1536` | `knowledge` |
| `courses/` | 1536 | `AGENTSAM_VECTORIZE_COURSES` | `agentsam-courses-oai3large-1536` | `agentsam_documents_oai3large_1536` | `course` |
| `docs/` | 1536 | `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` | `agentsam_schema_oai3large_1536` | `document` |
| `context/` | 1536 | `AGENTSAMVECTORIZE` | `inneranimalmedia-vectors` | `agentsam_documents_oai3large_1536` | `context` |
| `plans/` | 1536 | `AGENTSAMVECTORIZE` | `inneranimalmedia-vectors` | `agentsam_documents_oai3large_1536` | `plans` |
| `recipes/` | 1536 | `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` | `agentsam_schema_oai3large_1536` | `recipes` |
| `roadmap/` | 1536 | `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` | `agentsam_schema_oai3large_1536` | `roadmap` |
| `memory/` | 1536 | `AGENTSAM_VECTORIZE_MEMORY` | `agentsam-memory-oai3large-1536` | `agentsam_memory_oai3large_1536` | *(memory_key field)* |
| `studentprofiles/` | 1536 | `AGENTSAM_VECTORIZE_MEMORY` | `agentsam-memory-oai3large-1536` | `agentsam_memory_oai3large_1536` | *(memory_key field)* |
| `workflows/` | 1536 | `AGENTSAMVECTORIZE` | `inneranimalmedia-vectors` | `agentsam_documents_oai3large_1536` | `workflows` |
| *(dense docs)* | 3072 | **None — Supabase only** | N/A | `agentsam_deep_archive_oai3large_3072` | see archive_tier |

### RUNTIME CONTRACT — R2 Folders
- Never write to a folder path not listed above without updating this document and the ingest script
- Never use a CF Vectorize binding for a folder it is not assigned to
- `AGENTSAM_VECTORIZE_CODE` (`agentsam-codebase-oai3large-1536`) is reserved exclusively for repo source files — it does NOT map to any R2 folder in this bucket

---

## The Five Cloudflare Vectorize Bindings

All bindings are on the `inneranimalmedia` worker (production). All use `text-embedding-3-large` at 1536 dims.

| Binding Name | Index Name | Purpose |
|---|---|---|
| `AGENTSAMVECTORIZE` | `inneranimalmedia-vectors` | General workspace context — plans, workflows, context |
| `AGENTSAM_VECTORIZE_CODE` | `agentsam-codebase-oai3large-1536` | Repo source files only — fed by separate codebase indexer |
| `AGENTSAM_VECTORIZE_COURSES` | `agentsam-courses-oai3large-1536` | Learning OS course content |
| `AGENTSAM_VECTORIZE_MEMORY` | `agentsam-memory-oai3large-1536` | Agent episodic memory + student profiles |
| `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` | Platform knowledge, schema docs, field guides, recipes, roadmap |

### RUNTIME CONTRACT — Vectorize
- All queries use cosine similarity (`vector_cosine_ops`)
- Dimension is always 1536 — never pass a raw 3072 vector to any CF binding
- CF Vectorize stores the `vectorize_id` — always write it back to the corresponding Supabase row's `vectorize_id` column after insert
- Vectorize is the fast lookup; Supabase is the source of truth and holds full content + metadata

---

## The Supabase Tables

**Project:** `inneranimalmedia-business-supabase`
**Project ID:** `dpmuvynqixblxsilnlut`
**Schema:** `agentsam`
**Workspace constant:** `ws_inneranimalmedia`
**Tenant constant:** `tenant_sam_primeaux`

### 1536 Lane Tables

---

#### `agentsam_documents_oai3large_1536`
General document RAG. Courses, lessons, workspace context, plans, workflows.

**Vector index:** HNSW (`m=16, ef_construction=64`)
**Dedup key:** `(workspace_id, source_type, source_path)` — btree index exists, use for ON CONFLICT
**CF binding:** Varies by source_type (see folder map above)

**Allowed `source_type` values** *(enforced by CHECK constraint)*:
```
document, course, lesson, module, lab, asset, markdown,
product_doc, support_doc, architecture_note,
knowledge, plans, roadmap, recipes, context, workflows, other
```

**Key columns:**
- `source_type` — R2 folder name or content category (see allowed list)
- `source_path` — full R2 object key e.g. `courses/module-1/lesson-2.md`
- `course_id`, `module_id`, `lesson_id` — Learning OS hierarchy
- `chunk_index` — position within a chunked document
- `content_hash` — SHA-256 of raw content before chunking
- `vectorize_binding` — which CF binding mirrors this row (default: `AGENTSAM_VECTORIZE_COURSES`)
- `vectorize_index` — CF index name (default: `agentsam-documents-oai3large-1536`)
- `vectorize_id` — CF-assigned ID, written back after upsert

**RUNTIME CONTRACT — documents table:**
- `source_type` must be a value from the allowed list — the CHECK constraint will reject anything else
- `embedding_dims` must equal `1536` — enforced by CHECK
- `embedding_model` must be `text-embedding-3-large` — enforced by default
- After inserting to CF Vectorize, always UPDATE the row to set `vectorize_id`

---

#### `agentsam_schema_oai3large_1536`
Platform schema knowledge — binding contracts, query patterns, ownership rules, relationship summaries. This is where field guides, architecture docs, and the R2 folder mapping document itself live after ingestion.

**Vector index:** HNSW (`m=16, ef_construction=64`) — added via migration May 2026
**Dedup key:** `UNIQUE(workspace_id, database_kind, object_type, object_name, content_hash)`
**CF binding:** `AGENTSAM_VECTORIZE_SCHEMA`

**Allowed `database_kind` values** *(CHECK constraint)*:
```
d1, supabase, hyperdrive, vectorize, kv, r2, workers_ai
```

**Allowed `object_type` values** *(CHECK constraint)*:
```
table, view, foreign_table, index, policy, function, trigger,
migration, relationship_summary, schema_summary, binding_contract,
query_pattern, ownership_rule
```

---

#### `agentsam_database_schema_oai3large_1536`
Detailed schema awareness — table/column level. Prevents the agent from hallucinating column names or table structures. More granular than `agentsam_schema_oai3large_1536`.

**Vector index:** HNSW (`m=16, ef_construction=64`) — added via migration May 2026
**CF binding:** `AGENTSAM_VECTORIZE_SCHEMA`

**Key columns:** `database_kind`, `table_name`, `schema_name`, `object_type`, `column_names[]`

---

#### `agentsam_memory_oai3large_1536`
Agent episodic memory and student learning profiles. Per-user, per-session, durable.

**Vector index:** IVFFlat (`lists=100`)
**CF binding:** `AGENTSAM_VECTORIZE_MEMORY`
**Key columns:** `memory_key`, `user_id`, `oauth_client_id`

**RUNTIME CONTRACT — memory table:**
- No unique constraint on content_hash — use pre-insert hash check before writing
- `memory_key` should follow a consistent naming convention e.g. `session:{id}:summary`, `user:{id}:preference:{topic}`

---

#### `agentsam_codebase_chunks_oai3large_1536` + `agentsam_codebase_files_oai3large_1536`
Repository source file indexing. Cursor-like code retrieval. Fed by a separate codebase indexing pipeline — not the R2 AutoRAG ingest script.

**Vector index:** IVFFlat (`lists=100`) on chunks
**CF binding:** `AGENTSAM_VECTORIZE_CODE`

**RUNTIME CONTRACT — codebase tables:**
- These tables are NOT populated by the AutoRAG ingest pipeline
- Do not route R2 folder content into these tables
- `agentsam_codebase_files_oai3large_1536` is the parent (file metadata); `agentsam_codebase_chunks_oai3large_1536` holds the actual embeddings with `file_id` FK

---

### 3072 Deep Archive Lane

#### `agentsam_deep_archive_oai3large_3072`
Maximum semantic fidelity. Supabase only — no CF Vectorize mirror. For content that is queried infrequently but must be retrieved precisely: architecture decision records, OAuth field guides, dense technical runbooks, evaluation baselines.

**Vector index:** HNSW on `halfvec(3072)` cast — `((embedding)::halfvec(3072)) halfvec_cosine_ops`
*This is the correct pgvector 0.7+ pattern for HNSW at 3072 dims. Do not change it to IVFFlat or native vector.*

**Dedup keys:**
- `UNIQUE(workspace_id, source_type, source_ref, content_hash)`
- `UNIQUE(workspace_id, source_ref)` — `unique_workspace_source_ref`

**Allowed `source_type` values** *(CHECK constraint)*:
```
architecture, code_summary, database_summary, course_summary,
decision_record, workflow, eval_case, hard_retrieval,
audit_snapshot, quality_snapshot, deep_archive, other
```

**Allowed `archive_tier` values** *(CHECK constraint)*:
```
standard, eval, premium, architecture, legal, multilingual, golden
```

**Key columns:**
- `rule_id` — optional FK to `agentsam_rules_document.id` in D1. Set this when the content was produced by or describes a specific D1 rule. Prevents re-insertion when the underlying rule hasn't changed.
- `source_ref` — must be unique per workspace. Use a stable slug e.g. `mcp-oauth-field-guide-v1`, `autorag-architecture-may2026`

**Content that belongs here:**
- Field guides (like `mcp-oauth-field-guide.md`)
- Full architecture overviews (like this document)
- Dense multi-concept technical documents
- Evaluation baselines and golden test cases
- Content where wrong retrieval = real failure

**Content that does NOT belong here:**
- Anything the agent needs in real-time conversation
- Short content under ~2000 tokens
- Content already in the 1536 lane

**RUNTIME CONTRACT — deep archive:**
- Embedding model: `text-embedding-3-large`, `dimensions=3072`
- `embedding_dims` CHECK enforces `= 3072` — inserts with 1536-dim vectors will be rejected
- Never attempt to write a 3072 vector to CF Vectorize — it will fail
- Query via Supabase only: `SELECT ... ORDER BY embedding <=> $1::vector LIMIT 5`
- Always filter by `workspace_id` in every query

---

## The Workspace Identity Constants

Every row in every table must use these values. These are not configurable at runtime.

```
workspace_id  =  'ws_inneranimalmedia'      (text, not UUID — D1 convention)
tenant_id     =  'tenant_sam_primeaux'
```

**Exception:** Supabase `agentsam_workspaces.id` is a UUID. The `workspace_id` columns on RAG tables store the UUID of the `ws_inneranimalmedia` row from that table. Resolve it once at script startup with:

```sql
SELECT id FROM agentsam.agentsam_workspaces WHERE workspace_key = 'ws_inneranimalmedia';
```

---

## The Ingest Pipeline Rules

These apply to every ingest script that writes to this system, forever.

### Chunking
- Target chunk size: 512 tokens
- Overlap: 64 tokens
- Chunk on semantic boundaries (headings, paragraph breaks) — not hard character splits
- Store `chunk_index` (0-based position) and `content_hash` (SHA-256 of raw chunk text) on every row

### Embedding
- Model: `text-embedding-3-large`
- 1536 lane: `dimensions=1536` in the API call
- 3072 lane: omit `dimensions` parameter (returns full 3072)
- Batch size: 100 chunks per OpenAI API call maximum

### Deduplication
- Compute `content_hash = sha256(chunk_text)` before any API call
- Check for existing hash before embedding — don't pay twice for unchanged content
- Use `ON CONFLICT` upsert on the table's dedup key (see per-table section above)

### Write Order
1. Embed with OpenAI → get vector
2. Upsert to Supabase → get row `id`
3. Upsert to CF Vectorize (1536 lane only) → get `vectorize_id`
4. UPDATE Supabase row: set `vectorize_id`, `embedded_at`
5. INSERT to D1 `vectorize_sync_log`

### RUNTIME CONTRACT — Ingest
- Never reverse steps 3 and 2 — Supabase is source of truth, CF is the mirror
- Never write 3072-dim vectors to CF Vectorize
- Never use folder name as `source_type` if it isn't in the documents table's CHECK constraint allowed list
- Always write `vectorize_id` back to Supabase after CF insert — this is the cross-system link
- Always scope D1 sync log entries with `workspace_id` and `r2_folder`

---

## Agent Query Strategy

How the agent decides which lane and which table to query:

```
Message arrives
  │
  ├─ Is this a real-time / mid-conversation lookup?
  │   → Query 1536 lane via CF Vectorize (fast binding by content type)
  │   → Return top 5 chunks, ~1500 tokens
  │
  ├─ Is this a deep research / architecture question?
  │   → Query 1536 FIRST (fast, good enough for most cases)
  │   → If confidence low or intent = 'deep_research' or 'architecture':
  │       → Also query 3072 deep archive via Supabase
  │       → Merge results, deduplicate by source_path/source_ref
  │
  ├─ Is this a schema / codebase question?
  │   → Query AGENTSAM_VECTORIZE_SCHEMA (platform schema knowledge)
  │   → Also query AGENTSAM_VECTORIZE_CODE if it involves source files
  │
  └─ Is this a memory / session recall question?
      → Query AGENTSAM_VECTORIZE_MEMORY
      → Filter by user_id or memory_key prefix
```

### What NOT to query for
- Don't query any RAG lane for content the agent already has in its context window
- Don't query the 3072 lane on every message — it is a deliberate slow path
- Don't query CF Vectorize for content types that aren't indexed there (memory is indexed, but check binding assignment)

---

## The Two Schema Tables — Why Both Exist

There are two tables that look similar and cause confusion:

| Table | Purpose | Granularity |
|---|---|---|
| `agentsam_schema_oai3large_1536` | Binding contracts, relationship summaries, query patterns, ownership rules | System-level concepts |
| `agentsam_database_schema_oai3large_1536` | Table/column level schema awareness — prevents hallucinated column names | Row-level DB structure |

Think of it as: the first table teaches the agent *how the system works*. The second teaches the agent *what each table looks like*. Both get queried when the agent is about to write a SQL query or call a tool that touches the database.

---

## What This Document Is Not

- This is not a runbook for running the ingest script (that lives in `scripts/`)
- This is not a user-facing explanation of semantic search (that lives in `knowledge/semantic-retrieval-guide.txt`)
- This is not the internal AutoRAG full technical spec (that lives in `knowledge/agent-sam-autorag-understanding.txt`)

This document is the contract layer that sits above all of those — it describes the shape of the system so that both human and AI contributors can reason about it without having to reverse-engineer it from the code.

---

## Change Protocol

If any of the following changes, this document must be updated before any code is merged:

- Adding a new R2 folder
- Adding a new Supabase RAG table
- Adding or removing a CF Vectorize binding
- Changing a `source_type` CHECK constraint
- Changing the embedding model or dimension for any lane
- Changing the dedup key for any table
- Adding a new content category to the deep archive

**The migration comes first. The document update comes second. The code change comes third.**

This order exists because the database is the runtime contract. Code that writes to the wrong table or with the wrong dimension will fail silently if vectors are stored but never retrieved, or loudly if a CHECK constraint fires. The document being current means Cursor can read it and know what to do without asking.

---

*Confirmed live via Supabase MCP audit — May 25, 2026*
*Migrations applied this session:*
- `add_vector_indexes_schema_tables_and_expand_source_type_check`
- `drop_duplicate_source_type_constraint`
