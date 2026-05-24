# Dual Vectorize lanes (1024 vs 1536)

Canonical D1 skill: `skill_agentsam_dual_vectorize_lanes`  
Memory key: `schema_agentsam_dual_vectorize_lanes`

**Law:** One index, one dimension, one model. Never mix lanes in the same index.

## Verify before embed/query

- 1536: `AGENTSAMVECTORIZE.describe()` / `scripts/embed-codebase.py --describe-only`
- 1024: `RAG_EMBEDDING_DIMENSIONS` + `VECTORIZE` binding in `wrangler.production.toml`
- D1: `vectorize_index_registry` rows `vidx_autorag_1024`, `vidx_agentsam_vectors`

## Lane A — 1024 (`VECTORIZE`)

Documents, AutoRAG, `knowledge_search`, `rag_ingest`, `public.documents`.

## Lane B — 1536 (`AGENTSAMVECTORIZE`)

`agent_memory`, codebase embed, `wf_agentsam_codebase_embed`, `codebase-search.js`.

See migration `395_skill_agentsam_dual_vectorize_lanes.sql` for full decision matrix in D1 `content_markdown`.
