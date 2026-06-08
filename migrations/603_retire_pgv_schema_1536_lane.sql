-- Remove retired pgvector lane row after Supabase drop of agentsam_schema_oai3large_1536.
DELETE FROM agentsam_pgvector_lane_registry
WHERE id = 'pgv_schema_1536';
