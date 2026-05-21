-- =============================================================================
-- P2: Schema scaffolding (app_private / app_api)
-- STATUS: APPLIED in production Supabase via MCP (2026-05-21).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS app_private;
CREATE SCHEMA IF NOT EXISTS app_api;

COMMENT ON SCHEMA app_private IS 'Internal-only objects; no anon/authenticated access';
COMMENT ON SCHEMA app_api IS 'Stable RPC surface for authenticated clients';

GRANT USAGE ON SCHEMA app_api TO authenticated;
GRANT USAGE ON SCHEMA app_api TO service_role;

-- Lock down app_private (also run MANUAL file for CONCURRENTLY + execute revokes)
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA app_api FROM PUBLIC, anon;
