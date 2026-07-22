# Supabase Identifiers — agentsam + public — 2026-06-03

**Project:** `dpmuvynqixblxsilnlut` · **Schema:** `agentsam` (vector/RAG) + `public` (IAM content)

Related: [RAG lane insert contract](./AGENTSAM_RAG_LANE_SCHEMA_REFERENCE.md) · [Platform baseline](../platform/platform-baseline-2026-06-03.md)

---

## Dashboard / organization ownership (confirmed 2026-07-22)

Source: Supabase email **“OAuth Application Approval”** (Cursor OAuth app authorized on this org).

| Field | Value | Notes |
|-------|--------|--------|
| **Dashboard login / org owner email** | `sam_primeaux@icloud.com` | Confirmed as **Authorized by** and **Authorized for organization** |
| Organization ID | `syccscyruabhkctnpguw` | Org apps: `https://supabase.com/dashboard/org/syccscyruabhkctnpguw/apps` |
| Project ref | `dpmuvynqixblxsilnlut` | Production only |
| Project URL | `https://dpmuvynqixblxsilnlut.supabase.co` | |
| Project name | `inneranimalmedia-business-supabase` | |
| Cursor OAuth app Unique ID | `1b9eef1f-e155-4ee9-8ad7-439e903e7fae` | Revoke at org apps URL if unexpected |

**Not the dashboard owner** (IAM / app / notify aliases — do not use for Supabase account recovery unless support says otherwise):

| Email | Role in IAM ecosystem |
|-------|------------------------|
| `info@inneranimals.com` | Primary IAM operator login (`au_871d920d1233cbd1`) |
| `sam@inneranimalmedia.com` | Secondary IAM / deploy notify |
| `inneranimalclothing@gmail.com` | IAM alias |

Account recovery / PAT creation: use **`sam_primeaux@icloud.com`** → [Account → Access Tokens](https://supabase.com/dashboard/account/tokens).

---

## Canonical IDs for vector search

Every `agentsam_match_*` RPC and pgvector `WHERE workspace_id = $n::uuid` expects the **Supabase UUID**, not the D1 text workspace key.

```javascript
const SUPABASE_WORKSPACE_UUID = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac'; // ws_inneranimalmedia
const AGENT_SAM_USER_UUID     = '9c14ec31-61bc-4873-9beb-b3fc57620e52';
const SAM_OWNER_UUID          = '6cbd71f8-1d57-4530-9736-9bf03be1adad'; // info@inneranimals.com (primary login)
const SAM_OWNER_UUID_SECONDARY = '8678c8bb-b9b2-4aad-bb95-882d27d00787'; // sam@inneranimalmedia.com (backup)
```

Resolve at runtime when possible:

```javascript
// D1 text → Supabase uuid (Hyperdrive or REST on agentsam.agentsam_workspaces)
SELECT id FROM agentsam.agentsam_workspaces WHERE workspace_key = 'ws_inneranimalmedia';
```

---

## Workspaces (`agentsam.agentsam_workspaces`)

| workspace_key (D1) | Supabase UUID | display_name |
|---|---|---|
| `ws_inneranimalmedia` | `fa1f12a8-c841-4b79-a26c-d53a78b17dac` | Inner Animal Media |
| `ws_connor_mcneely` | `105ac2d1-8e61-4cec-80c8-ef2a0902448d` | Connor McNeely |
| `ws_meauxbility` | `869137d3-cd65-4ac1-88cc-a1bad9844718` | Meauxbility |

---

## Vector / RAG lanes (embedding tables)

| Table | Dims | ~Size | Notes |
|---|---:|---:|---|
| `agentsam_database_schema_oai3large_1536` | 1536 | 1.1 MB | D1 schema catalog |
| `agentsam_codebase_chunks_oai3large_1536` | 1536 | 8.6 MB | Code chunks |
| `agentsam_documents_oai3large_1536` | 1536 | 6.4 MB | Docs / roadmaps / recipes |
| `agentsam_memory_oai3large_1536` | 1536 | 5.0 MB | Agent memory (vector lane) |
| `agentsam_deep_archive_oai3large_3072` | 3072 | 1.6 MB | Golden architecture docs |
| `agentsam_codebase_files_oai3large_1536` | 1536 | 128 kB | File-level metadata |
| `agentsam_schema_oai3large_1536` | 1536 | 296 kB | **Inactive** — superseded by `agentsam_database_schema_oai3large_1536` |

### Worker Vectorize bindings (2026-06-03)

| Binding | CF index | Supabase source table |
|---|---|---|
| `AGENTSAM_VECTORIZE_COURSES` | `agentsam-courses-oai3large-1536` | `agentsam_documents_oai3large_1536` |
| `AGENTSAM_VECTORIZE_MEMORY` | `agentsam-memory-oai3large-1536` | `agentsam_memory_oai3large_1536` |
| `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` | `agentsam_database_schema_oai3large_1536` |
| `AGENTSAM_VECTORIZE_CODE` | `agentsam-codebase-oai3large-1536` | `agentsam_codebase_chunks_oai3large_1536` |

Deep archive: pgvector only (3072d). No CF Vectorize mirror.

CF index `agentsam-documents-oai3large-1536` exists but is **not bound** on either worker yet.

---

## `agentsam_memory` vs `agentsam_memory_oai3large_1536`

Two separate tables:

- **`agentsam_memory`** — structured write target (type, key, tags, importance, pinned, …)
- **`agentsam_memory_oai3large_1536`** — vector search lane

Intended sync via `d1_id` / `sync_key`; sync path not fully verified.

---

## pgvector match RPCs

| Function | Purpose |
|---|---|
| `agentsam_match_documents(...)` | Documents lane |
| `agentsam_match_schema_oai3large_1536(...)` | Schema lane |
| `agentsam_match_deep_archive_oai3large_3072(...)` | Deep archive (3072d) |

**No dedicated RPC** for codebase or memory lanes — use inline `<=>` cosine SQL against the table (see `src/core/semantic-retrieval-dispatch.js`).

All match functions take `p_workspace_id uuid` (not `ws_*` text).

---

## Core operational tables (summary)

| Table | Role |
|---|---|
| `agentsam_memory` | Primary structured memory store |
| `agentsam_tool_call_events` | Tool execution audit |
| `agentsam_usage_events` | Token/cost telemetry |
| `agentsam_todo` | Agent task queue |
| `agentsam_mcp_health_checks` | MCP health snapshots |
| `agentsam_workflow_runs` / `agentsam_workflow_step_events` | Workflow telemetry |
| `agentsam_worker_events` / `agentsam_worker_errors` | Worker raw telemetry |
| `agentsam_search_log` | Search analytics |

---

## `public` schema — IAM content

Small structured tables for iAutodidact: `iam_courses`, `iam_course_modules`, `iam_course_lessons`, `iam_quizzes`, `iam_glossary`, `iam_workflow_templates`, `iam_tool_cards`, etc.

---

## MCP / ingest checklist

1. Resolve `ws_inneranimalmedia` → `fa1f12a8-c841-4b79-a26c-d53a78b17dac` before any vector call.
2. PostgREST returns `embedding` as a **string** `"[...]"` — parse before dimension checks.
3. Schema lane select: no `source_ref` column — use `database_name`, `object_type`, `table_name`.
4. Code lane select: `file_path`, `chunk_index` — no `vectorize_*` mirror columns on Supabase row.
5. Documents Vectorize sync targets **`agentsam-courses-oai3large-1536`** until `AGENTSAM_VECTORIZE_DOCUMENTS` is bound.
