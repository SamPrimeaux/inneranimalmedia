-- 589: Refresh vectorize_1536_pipeline_protocol — remove AGENTSAMVECTORIZE references.
-- Apply after 588.

UPDATE agentsam_rules_document
SET
  title = 'Vectorize 1536 text pipeline protocol (six lanes)',
  body_markdown = '# Vectorize 1536 Text Pipeline Protocol

## Non-negotiable
Read **`vectorize_dimension_integrity_rule`** first. One index · one model · one dimension.

## Scope
This protocol covers **OpenAI text-embedding-3-large @ 1536** lanes only:
- CODE, SCHEMA, MEMORY, DOCUMENTS, COURSES bindings
- **Not** Gemini media (`rule_vectorize_lane_moviemode`) · **Not** deep archive @ 3072

## Before any batch embed
1. Pick lane (`rule_vectorize_router`).
2. Confirm binding/index/table row in `rule_iam_bindings_vectorize_api_map`.
3. Embed with OpenAI @ 1536 (same model at query time).
4. Upsert Supabase row, then Vectorize with **Supabase UUID** as vector id.

## Operator scripts
- Code: `scripts/reindex_codebase_dashboard_agent.mjs`
- R2 docs: `scripts/ingest_r2_to_rag.mjs`
- Skills: `scripts/ingest_repo_skills_rag.mjs`
- Resync: `scripts/rag_ingest.mjs --lane all --update-registry`

## RETIRED
- `env.AGENTSAMVECTORIZE` / `inneranimalmedia-vectors`
- REST describe on a single orphan index name — use per-lane bindings or `GET /api/internal/agentsam-vectorize/describe`

## Worker
- `src/core/semantic-retrieval-dispatch.js`
- `src/core/rag-lanes.js`
- `src/core/agentsam-vectorize.js`',
  updated_at_epoch = unixepoch(),
  notes = 'Aligned with 588 six-lane architecture.'
WHERE id = 'vectorize_1536_pipeline_protocol';
