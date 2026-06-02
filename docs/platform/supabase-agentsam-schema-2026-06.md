# Supabase schema — agentsam vs public

**Verified:** 2026-06-02 · **Cursor rule:** `.cursor/rules/iam-supabase-agentsam-schema.mdc`

## Summary

- **No `public.agentsam_*` tables exist.** Do not reference them in code or agent prompts.
- **Agent data:** schema `agentsam` (RLS on all tables).
- **Platform content:** schema `public`, `iam_*` prefix only.

## RAG lanes (Vectorize mirrors)

| Table | Rows (snapshot) | Vectorize index |
|-------|-----------------|-----------------|
| `agentsam_memory_oai3large_1536` | 190 | `AGENTSAM_VECTORIZE_MEMORY` |
| `agentsam_documents_oai3large_1536` | 307 | `AGENTSAM_VECTORIZE_COURSES` |
| `agentsam_codebase_chunks_oai3large_1536` | 262 | `AGENTSAM_VECTORIZE_CODE` |
| `agentsam_codebase_files_oai3large_1536` | 48 | (catalog, no embeddings) |
| `agentsam_database_schema_oai3large_1536` | 593 | `AGENTSAM_VECTORIZE_SCHEMA` — **canonical** |
| `agentsam_schema_oai3large_1536` | 9 | **deprecated duplicate — no new writes** |
| `agentsam_deep_archive_oai3large_3072` | 2 | Supabase-only 3072-dim |

## Memory

| Table | Rows | Purpose |
|-------|------|---------|
| `agentsam_memory` | 25 | Operational structured memory (`d1_id` sync) |
| `agentsam_memory_oai3large_1536` | 190 | Vector retrieval lane |

## Observability

Live: `agentsam_usage_events` (197), `agentsam_tool_call_events` (12), `agentsam_mcp_health_checks` (1).

Empty / standby: workflow events, worker rollups, deploy/error/webhook event tables (0 rows at audit time).

## Legacy pipeline

`agentsam_legacy_workflow_runs` (+ child tables) — superseded by D1 `agentsam_workflow_*` control plane.

## Public schema (`iam_*` only)

Examples: `iam_glossary`, `iam_tool_cards`, `iam_workflow_templates`, `iam_courses` / modules / lessons, `iam_help_categories`, `iam_keyboard_shortcuts`, `iam_onboarding_steps`, `iam_ui_copy_packs`, `iam_quizzes` (not seeded).

## Consolidation note

`agentsam_schema_oai3large_1536` and `agentsam_database_schema_oai3large_1536` share structure and Vectorize binding; only **database_schema** is canonical for new inserts and semantic search config.
