-- 508: Smoke-tool catalog — operation dispatch + per-tenant credentials (NOT broad platform)
--
-- Policy (2026-06):
--   • R2 / KV / CF API → caller's CLOUDFLARE_API_TOKEN (user_api_keys), per account — not one shared bucket.
--   • Postgres / pgvector / AutoRAG → caller's SUPABASE_* keys; no cross-tenant Hyperdrive.
--   • Vectorize lanes → four AGENTSAM_VECTORIZE_* bindings (1536); legacy VECTORIZE / AGENTSAMVECTORIZE retired.
--   • Broad platform amenity → transactional email only (platform_scoped Resend, recipient = auth_user).
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/508_smoke_tool_handler_catalog_fix.sql

-- KV: cf executor; credentials from workspace + cloudflare API token (lists user's namespaces)
UPDATE agentsam_tools
SET handler_type = 'cf',
    tool_category = 'storage.kv.manage',
    handler_config = '{"operation":"kv.manage","auth_source":"workspace","provider":"cloudflare","resource":"kv"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_kv_manage';

-- AutoRAG search: user's Supabase/pgvector lane (not platform HYPERDRIVE binding in catalog)
UPDATE agentsam_tools
SET handler_type = 'hyperdrive',
    tool_category = 'search.autorag',
    handler_config = '{"operation":"autorag.search","auth_source":"workspace","provider":"supabase","data_plane":"user"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_autorag';

-- pgvector: user's Supabase keys; workspace-scoped semantic search
UPDATE agentsam_tools
SET handler_type = 'hyperdrive',
    tool_category = 'database.supabase.vector',
    handler_config = '{"operation":"vector.search","auth_source":"workspace","provider":"supabase","data_plane":"user"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_supabase_vector';

-- Memory: tenant + user scoped (query in public contract, not prompt)
UPDATE agentsam_tools
SET handler_type = 'memory',
    tool_category = 'memory.manager',
    handler_config = '{"operation":"memory.manage","auth_source":"workspace","scope":"tenant_user"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_manager';

-- R2: per-account CF token — all buckets the user owns (not a single platform bucket)
UPDATE agentsam_tools
SET handler_type = 'cf',
    tool_category = 'storage.r2.get',
    handler_config = '{"operation":"r2.read","auth_source":"workspace","provider":"cloudflare","resource":"r2"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_r2_get';

UPDATE agentsam_tools
SET handler_type = 'cf',
    tool_category = 'storage.r2.put',
    handler_config = '{"operation":"r2.write","auth_source":"workspace","provider":"cloudflare","resource":"r2"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_r2_put';

UPDATE agentsam_tools
SET handler_type = 'cf',
    tool_category = 'storage.r2.delete',
    handler_config = '{"operation":"r2.delete","auth_source":"workspace","provider":"cloudflare","resource":"r2"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_r2_delete';

-- Email: only broad IAM amenity — Resend outbox per tenant/auth_user (all verified addresses for that user)
UPDATE agentsam_tools
SET handler_type = 'notify',
    tool_category = 'comms.email',
    handler_config = '{"operation":"send_email","auth_source":"platform_scoped","provider":"resend","recipient_scope":"auth_user"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_send_email';

-- Repair legacy 477 rows that still say http/kv dispatch or copy platform HYPERDRIVE into customer tools
UPDATE agentsam_tools
SET handler_type = 'cf',
    tool_category = 'storage.kv.manage',
    handler_config = '{"operation":"kv.manage","auth_source":"workspace","provider":"cloudflare","resource":"kv"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_kv_manage'
  AND handler_type IN ('http', 'kv', 'proxy');

UPDATE agentsam_tools
SET handler_type = 'hyperdrive',
    handler_config = '{"operation":"autorag.search","auth_source":"workspace","provider":"supabase","data_plane":"user"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_autorag'
  AND handler_type IN ('ai', 'mcp', 'proxy');

UPDATE agentsam_tools
SET handler_type = 'hyperdrive',
    handler_config = '{"operation":"vector.search","auth_source":"workspace","provider":"supabase","data_plane":"user"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_supabase_vector'
  AND handler_type IN ('supabase', 'ai');

UPDATE agentsam_tools
SET handler_type = 'memory',
    handler_config = '{"operation":"memory.manage","auth_source":"workspace","scope":"tenant_user"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_manager'
  AND handler_type IN ('mcp', 'proxy');
