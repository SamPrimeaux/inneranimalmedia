-- 445: Route agent bootstrap cache from ai_compiled_context_cache → agentsam_project_context.
-- Runtime: src/core/agent-bootstrap-project-context.js (project_key=agent_bootstrap, project_type=bootstrap_cache).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/445_agent_bootstrap_project_context.sql

CREATE INDEX IF NOT EXISTS idx_pctx_agent_bootstrap_ttl
  ON agentsam_project_context(tenant_id, project_key, project_type, updated_at);

-- Best-effort copy of any legacy bootstrap rows (context_type = bootstrap).
INSERT OR IGNORE INTO agentsam_project_context (
  id,
  tenant_id,
  workspace_id,
  project_key,
  project_name,
  project_type,
  status,
  priority,
  description,
  notes,
  session_id,
  agent_id,
  cost_usd,
  created_at,
  updated_at
)
SELECT
  'ctx_bootstrap_' || lower(hex(randomblob(6))),
  COALESCE(NULLIF(trim(tenant_id), ''), 'legacy_bootstrap'),
  NULL,
  'agent_bootstrap',
  'Agent bootstrap snapshot',
  'bootstrap_cache',
  'active',
  0,
  'Migrated from ai_compiled_context_cache',
  compiled_context,
  context_hash,
  'agent-sam',
  0,
  COALESCE(created_at, unixepoch()),
  COALESCE(last_accessed_at, unixepoch())
FROM ai_compiled_context_cache
WHERE context_type = 'bootstrap'
  AND compiled_context IS NOT NULL
  AND trim(compiled_context) != ''
  AND (expires_at IS NULL OR expires_at > unixepoch());
