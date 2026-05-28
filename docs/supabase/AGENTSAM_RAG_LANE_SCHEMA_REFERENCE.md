# AgentSam Supabase RAG Lane Schema Reference

**Schema:** `agentsam` | **Project:** `dpmuvynqixblxsilnlut`  
**Generated:** 2026-05-28

Use this file as the authoritative insert contract for any embedding ingest script.  
Always verify against live schema before running migrations.  
**Source of truth:** Supabase `agentsam` schema.

**Related:** [AutoRAG Knowledge Retrieval Runtime Contract](../autorag/AUTORAG_KNOWLEDGE_RETRIEVAL_RUNTIME_CONTRACT.md)

---

## Lane Summary

| Lane            | Table                                    | Dims | Vectorize Binding          | Notes                          |
|-----------------|------------------------------------------|------|----------------------------|--------------------------------|
| DOCUMENTS       | agentsam_documents_oai3large_1536        | 1536 | AGENTSAM_VECTORIZE_COURSES | Courses, docs, learn content   |
| MEMORY          | agentsam_memory_oai3large_1536           | 1536 | none (no vectorize cols)   | Durable semantic agent memory  |
| SCHEMA          | agentsam_database_schema_oai3large_1536  | 1536 | AGENTSAM_VECTORIZE_SCHEMA  | DB schema awareness            |
| CODEBASE CHUNKS | agentsam_codebase_chunks_oai3large_1536  | 1536 | none (no vectorize cols)   | Cursor-like code retrieval     |
| DEEP ARCHIVE    | agentsam_deep_archive_oai3large_3072     | 3072 | none (pgvector only)       | Max-quality, exact search      |

**CRITICAL:** Deep archive uses `vector(3072)` — NOT 1536. Every other lane is 1536.  
Deep archive has no CF Vectorize mirror. pgvector exact search only.

---

## DOCUMENTS lane

### `agentsam.agentsam_documents_oai3large_1536`

#### Required fields (NOT NULL, no default)

| Column       | Type    | Notes                                      |
|--------------|---------|--------------------------------------------|
| workspace_id | uuid    | FK → agentsam_workspaces.id                |
| content      | text    | The chunk text to embed                    |
| source_type  | text    | See enum below                             |
| heading_path | text[]  | Breadcrumb array e.g. `['Intro', 'Setup']` |
| chunk_index  | int     | 0-based position within parent document    |
| chunk_type   | text    | See enum below                             |

#### Optional but important

| Column         | Type        | Default                          | Notes                              |
|----------------|-------------|----------------------------------|------------------------------------|
| id             | uuid        | gen_random_uuid()                | Auto-generated if omitted          |
| title          | text        | null                             | Human-readable chunk title         |
| user_id        | uuid        | null                             | Auth user who ingested             |
| source_url     | text        | null                             |                                    |
| source_path    | text        | null                             | R2 key or file path                |
| source_ref     | text        | null                             | Git SHA, version, etc.             |
| course_id      | text        | null                             | Used for course content            |
| module_id      | text        | null                             |                                    |
| lesson_id      | text        | null                             |                                    |
| slug           | text        | null                             |                                    |
| content_hash   | text        | null (UNIQUE constraint)         | sha256 hex for dedup               |
| token_count    | int         | null                             | Set from tokenizer                 |
| embedding      | vector(1536)| null                             | text-embedding-3-large dims=1536   |
| embedding_model| text        | 'text-embedding-3-large'         | Must match actual model used       |
| embedding_dims | int         | 1536 (CHECK: = 1536)             | Do not override                    |
| embedded_at    | timestamptz | null                             | Set when embedding is written      |
| vectorize_binding | text     | 'AGENTSAM_VECTORIZE_COURSES'     | CF binding that mirrors this row   |
| vectorize_index   | text     | 'agentsam-documents-oai3large-1536' |                                 |
| vectorize_id   | text        | null                             | Set after CF Vectorize upsert      |
| metadata       | jsonb       | '{}'                             | Any extra routing/display data     |

#### `source_type` enum (CHECK constraint)

`document`, `course`, `lesson`, `module`, `lab`, `asset`, `markdown`,
`product_doc`, `support_doc`, `architecture_note`, `knowledge`, `plans`,
`roadmap`, `recipes`, `context`, `workflows`, `other`, `clients`,
`workspaces`, `brands`

→ For skills: use `knowledge`

#### `chunk_type` enum (CHECK constraint)

`document`, `section`, `course_overview`, `module_overview`, `lesson_section`,
`objective`, `concept_map`, `lab`, `asset`, `metadata`, `summary`, `other`

→ For skills: use `section` (default) or `document` for single-chunk skills

#### Minimal insert (skills → documents lane)

```python
{
    "workspace_id": WORKSPACE_UUID,
    "title": skill_name,
    "content": chunk_text,
    "source_type": "knowledge",
    "source_path": f"knowledge/skills/{skill_id}/{chunk_index:04d}.json",
    "heading_path": heading_path_list,
    "chunk_index": chunk_index,
    "chunk_type": "section",
    "content_hash": sha256_hex[:64],
    "token_count": token_count,
    "embedding": embedding_list_1536,
    "embedding_model": "text-embedding-3-large",
    "embedding_dims": 1536,
    "embedded_at": datetime.utcnow().isoformat(),
    "metadata": {
        "skill_id": skill_id,
        "slash_trigger": slash_trigger,
        "tags": tags_list,
        "task_types": task_types_list,
        "always_apply": always_apply,
    }
}
```

---

## MEMORY lane

### `agentsam.agentsam_memory_oai3large_1536`

#### Required fields

| Column       | Type    | Notes                           |
|--------------|---------|---------------------------------|
| workspace_id | uuid    | FK → agentsam_workspaces.id     |
| memory_key   | text    | Unique key for this memory atom |

#### Optional but important

| Column         | Type        | Default           | Notes                            |
|----------------|-------------|-------------------|----------------------------------|
| id             | uuid        | gen_random_uuid() |                                  |
| user_id        | uuid        | null              |                                  |
| oauth_client_id| text        | null              | MCP client identity              |
| content        | text        | null              | Memory text body                 |
| embedding      | vector(1536)| null              | text-embedding-3-large dims=1536 |
| source         | text        | null              | Origin: 'agent', 'user', etc.    |
| metadata       | jsonb       | '{}'              |                                  |

#### Notes

- No `embedding_model` / `embedding_dims` / `embedded_at` columns — simpler schema
- No `vectorize_binding` / `vectorize_index` columns — not mirrored to CF Vectorize
- `memory_key` should be meaningful and stable (e.g. `platform_context`, `deploy_rules`)
- Use UPSERT on `memory_key` for idempotent writes

#### Minimal insert

```python
{
    "workspace_id": WORKSPACE_UUID,
    "memory_key": "skill_context_summary",
    "content": memory_text,
    "embedding": embedding_list_1536,
    "source": "skill_ingest",
    "metadata": {"skill_id": skill_id}
}
```

---

## SCHEMA lane

### `agentsam.agentsam_database_schema_oai3large_1536`

#### Required fields

| Column        | Type | Notes                                |
|---------------|------|--------------------------------------|
| workspace_id  | uuid | FK → agentsam_workspaces.id          |
| database_kind | text | See enum below                       |
| database_name | text | e.g. 'inneranimalmedia-business'     |
| object_type   | text | See enum below                       |
| title         | text | Human-readable label for the object  |
| content       | text | Descriptive text to embed            |

#### Optional but important

| Column          | Type        | Default                         | Notes                          |
|-----------------|-------------|---------------------------------|--------------------------------|
| id              | uuid        | gen_random_uuid()               |                                |
| schema_name     | text        | null                            | e.g. 'agentsam', 'public'      |
| table_name      | text        | null                            |                                |
| content_hash    | text        | null (UNIQUE)                   | Dedup key                      |
| token_count     | int         | null                            |                                |
| column_names    | text[]      | '{}'                            | Column list for table objects  |
| source_path     | text        | null                            | Migration file path            |
| migration_id    | text        | null                            |                                |
| embedding       | vector(1536)| null                            |                                |
| embedding_model | text        | 'text-embedding-3-large'        |                                |
| embedding_dims  | int         | 1536 (CHECK: = 1536)            |                                |
| embedded_at     | timestamptz | null                            |                                |
| vectorize_binding | text      | 'AGENTSAM_VECTORIZE_SCHEMA'     |                                |
| vectorize_index | text        | 'agentsam-schema-oai3large-1536'|                                |
| vectorize_id    | text        | null                            | Set after CF Vectorize upsert  |
| metadata        | jsonb       | '{}'                            |                                |

#### `database_kind` enum

`d1`, `supabase`, `hyperdrive`, `vectorize`, `kv`, `r2`, `workers_ai`

#### `object_type` enum

`table`, `column`, `index`, `foreign_key`, `rls_policy`, `migration`,
`query_pattern`, `view`, `function`, `trigger`, `enum`, `binding`,
`relationship`, `ownership_rule`

---

## CODEBASE CHUNKS lane

### `agentsam.agentsam_codebase_chunks_oai3large_1536`

#### Required fields

| Column       | Type | Notes                                        |
|--------------|------|----------------------------------------------|
| workspace_id | uuid | FK → agentsam_workspaces.id                  |
| file_path    | text | Relative path e.g. 'src/api/agent.js'        |
| content      | text | The code chunk text to embed                 |

#### Optional but important

| Column      | Type        | Default           | Notes                                 |
|-------------|-------------|-------------------|---------------------------------------|
| id          | uuid        | gen_random_uuid() |                                       |
| file_id     | uuid        | null              | FK → agentsam_codebase_files.id       |
| embedding   | vector(1536)| null              | text-embedding-3-large dims=1536      |
| chunk_index | int         | null              | 0-based position within file          |
| token_count | int         | null              |                                       |
| metadata    | jsonb       | '{}'              |                                       |

#### Notes

- Leanest schema of all lanes — no `embedding_model`, `embedding_dims`, `embedded_at`
- No `vectorize_binding` / `vectorize_index` — not yet mirrored to CF Vectorize
- `file_id` is optional but recommended — requires parent row in `agentsam_codebase_files` first
- No `content_hash` column — dedup must be done by `file_path` + `chunk_index`

#### Minimal insert

```python
{
    "workspace_id": WORKSPACE_UUID,
    "file_path": "src/api/agent.js",
    "content": chunk_text,
    "chunk_index": 0,
    "token_count": token_count,
    "embedding": embedding_list_1536,
    "metadata": {"language": "javascript", "function_name": "handleAgentRequest"}
}
```

---

## DEEP ARCHIVE lane

### `agentsam.agentsam_deep_archive_oai3large_3072`

**CRITICAL:** `embedding` is `vector(3072)` — NOT 1536.

Use: `openai.embeddings.create(model="text-embedding-3-large", input=text)`  
Do **NOT** pass `dimensions=1536` — omit `dimensions` param entirely for full 3072.

#### Required fields

| Column       | Type | Notes                                              |
|--------------|------|----------------------------------------------------|
| workspace_id | uuid | FK → agentsam_workspaces.id                        |
| content      | text | The text to embed — should be high-value, stable   |
| content_hash | text | sha256 hex — NOT NULL, used for dedup              |
| source_type  | text | See enum below                                     |
| archive_tier | text | See enum below                                     |

#### Optional but important

| Column         | Type        | Default              | Notes                                      |
|----------------|-------------|----------------------|--------------------------------------------|
| id             | uuid        | gen_random_uuid()    |                                            |
| user_id        | uuid        | null                 |                                            |
| title          | text        | null                 | Required in practice — always set it       |
| source_url     | text        | null                 |                                            |
| source_path    | text        | null                 |                                            |
| source_ref     | text        | null                 | Git SHA, doc version, etc.                 |
| embedding      | vector(3072)| null                 | text-embedding-3-large FULL dims           |
| embedding_model| text        | 'text-embedding-3-large' |                                        |
| embedding_dims | int         | 3072 (CHECK: = 3072) | Do not override                            |
| embedded_at    | timestamptz | null                 | Set when embedding is written              |
| metadata       | jsonb       | '{}'                 |                                            |
| rule_id        | text        | null                 | Links to agentsam_rules_document.id in D1  |

#### `source_type` enum

`architecture`, `code_summary`, `database_summary`, `course_summary`,
`decision_record`, `workflow`, `eval_case`, `hard_retrieval`,
`audit_snapshot`, `quality_snapshot`, `deep_archive`, `other`

#### `archive_tier` enum

`standard`, `eval`, `premium`, `architecture`, `legal`, `multilingual`, `golden`

#### Tier guide

| Tier         | Use for                                                              |
|--------------|----------------------------------------------------------------------|
| golden       | Permanent platform contracts — runtime rules, deploy conventions      |
| architecture | ADRs, module boundaries, structural decisions                        |
| eval         | Canonical test cases, regression baselines                           |
| premium      | Hard-retrieval disambiguators, content that caused past RAG failures  |
| standard     | General deep archive content                                         |
| legal        | Terms, compliance notes                                              |
| multilingual | Multi-language content                                               |

#### Minimal insert

```python
{
    "workspace_id": WORKSPACE_UUID,
    "title": "AgentSam Deploy Conventions",
    "content": content_text,
    "content_hash": hashlib.sha256(content_text.encode()).hexdigest(),
    "source_type": "architecture",
    "archive_tier": "golden",
    "source_path": "workspaces/inneranimalmedia/project-reference.md",
    "embedding": embedding_list_3072,   # NO dimensions= param when creating
    "embedding_model": "text-embedding-3-large",
    "embedding_dims": 3072,
    "embedded_at": datetime.utcnow().isoformat(),
    "metadata": {"section": "conventions", "review_after": "2026-09-01"}
}
```

---

## Workspace UUID lookup

The `workspace_id` column is a UUID FK — NOT the text `ws_inneranimalmedia`.  
Query before inserting:

```python
import os
from supabase import create_client

supa = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

res = supa.schema("agentsam").from_("agentsam_workspaces")\
    .select("id")\
    .eq("workspace_key", "ws_inneranimalmedia")\
    .single()\
    .execute()

WORKSPACE_UUID = res.data["id"]
```

---

## Embedding helper — correct call per lane

```python
from openai import OpenAI
oai = OpenAI()

def embed_1536(texts: list[str]) -> list[list[float]]:
    """For: documents, memory, schema, codebase_chunks"""
    resp = oai.embeddings.create(
        model="text-embedding-3-large",
        input=texts,
        dimensions=1536,
    )
    return [d.embedding for d in resp.data]

def embed_3072(texts: list[str]) -> list[list[float]]:
    """For: deep_archive ONLY — full native dimensions, no truncation"""
    resp = oai.embeddings.create(
        model="text-embedding-3-large",
        input=texts,
        # NO dimensions param — returns full 3072
    )
    return [d.embedding for d in resp.data]
```

---

## Dedup pattern (`content_hash`)

All lanes except `codebase_chunks` and `memory` have a `content_hash` field.  
Always compute before inserting and upsert on conflict:

```python
import hashlib

def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

# Supabase upsert on content_hash
supa.schema("agentsam")\
    .from_("agentsam_documents_oai3large_1536")\
    .upsert(row, on_conflict="content_hash")\
    .execute()
```

---

## Lane selection guide for skill ingest

| Goal                                    | Lane        |
|-----------------------------------------|-------------|
| Skill chunk for semantic search         | DOCUMENTS   |
| Skill summary as agent memory atom      | MEMORY      |
| Skill as permanent platform convention  | DEEP ARCHIVE (golden/architecture) |
| Skill describing DB schema patterns     | SCHEMA      |
| Skill content is code                   | CODEBASE CHUNKS |
