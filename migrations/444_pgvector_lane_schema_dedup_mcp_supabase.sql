-- 444: pgvector lane hygiene + supabase_vector structured MCP args (no raw SQL from OAuth).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/444_pgvector_lane_schema_dedup_mcp_supabase.sql

-- agentsam_schema_oai3large_1536 (9 rows) is superseded by agentsam_database_schema_oai3large_1536 (593 rows).
UPDATE agentsam_pgvector_lane_registry
SET is_active = 0,
    description = 'Superseded by agentsam_database_schema_oai3large_1536 — use purpose=database_schema for schema RAG',
    updated_at = datetime('now')
WHERE id = 'pgv_schema_1536';

UPDATE agentsam_pgvector_lane_registry
SET description = 'Canonical D1/Supabase/KV/R2 schema catalog @1536 — prefer over agentsam_schema_oai3large_1536',
    updated_at = datetime('now')
WHERE id = 'pgv_database_schema_1536';

UPDATE agentsam_pgvector_lane_registry
SET description = 'Codebase chunk lane @1536 — 0 rows until embed-codebase-chunks-backfill / fresh-codebase-rag runs',
    updated_at = datetime('now')
WHERE id = 'pgv_codebase_chunks_1536';

UPDATE agentsam_tools
SET input_schema = '{"type":"object","required":["query"],"properties":{"query":{"type":"string","description":"Natural language search text"},"purpose":{"type":"string","description":"Lane purpose from agentsam_vectorize_describe (memory, documents, database_schema, codebase_chunks, deep_archive)"},"table_name":{"type":"string","description":"Optional exact agentsam.* table name"},"limit":{"type":"integer","minimum":1,"maximum":50,"default":8},"workspace_id":{"type":"string","description":"D1 workspace id (ws_*) — scopes tenant tables when applicable"}},"additionalProperties":false}',
    updated_at = unixepoch()
WHERE tool_key = 'supabase_vector';
