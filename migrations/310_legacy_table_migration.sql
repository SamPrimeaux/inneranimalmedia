-- 310: Backfill agentsam_* from legacy agent_commands, agent_command_proposals,
--      mcp_command_suggestions, agent_costs, ai_provider_usage.
-- Safe to re-run: INSERT OR IGNORE where IDs collide.
-- Apply (example):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/310_legacy_table_migration.sql
--
-- NOT migrated here:
--   - agent_request_queue → agentsam_approval_queue (missing required user_id/tool_name/action_summary)
--   - mcp_entitlements → agentsam_user_policy (agentsam_user_policy is Cursor UI settings; CF Access
--     rows stay on mcp_entitlements until a dedicated entitlement table exists)

-- ─── 1. agent_commands → agentsam_commands ────────────────────────────────────
INSERT OR IGNORE INTO agentsam_commands
  (id, workspace_id, tenant_id, slug, display_name, description, category,
   mapped_command, is_active, is_global, created_at, updated_at)
SELECT
  ac.id,
  COALESCE(aw.id, 'ws_inneranimalmedia'),
  ac.tenant_id,
  ac.slug,
  ac.name,
  COALESCE(ac.description, ''),
  COALESCE(ac.category, 'general'),
  COALESCE(NULLIF(TRIM(ac.command_text), ''), ac.name),
  CASE WHEN COALESCE(ac.status, 'active') = 'active' THEN 1 ELSE 0 END,
  CASE WHEN COALESCE(ac.is_public, 0) = 1 THEN 1 ELSE 0 END,
  COALESCE(datetime(ac.created_at, 'unixepoch'), datetime('now')),
  COALESCE(datetime(ac.updated_at, 'unixepoch'), datetime('now'))
FROM agent_commands ac
LEFT JOIN agentsam_workspace aw ON aw.tenant_id = ac.tenant_id
WHERE ac.slug IS NOT NULL
  AND ac.tenant_id IS NOT NULL
  AND COALESCE(ac.status, 'active') != 'deprecated';

-- ─── 2. agent_command_proposals → agentsam_approval_queue ─────────────────────
INSERT OR IGNORE INTO agentsam_approval_queue
  (id, tenant_id, workspace_id, user_id, session_id,
   tool_name, action_summary, input_json, risk_level, status,
   approved_by, decided_at, expires_at, created_at)
SELECT
  acp.id,
  acp.tenant_id,
  NULL,
  COALESCE(acp.proposed_by, '__unknown__'),
  acp.agent_session_id,
  COALESCE(NULLIF(TRIM(acp.command_name), ''), NULLIF(TRIM(acp.tool), ''), 'command'),
  COALESCE(NULLIF(TRIM(acp.rationale), ''), NULLIF(TRIM(acp.command_text), ''), 'Agent proposal'),
  json_object(
    'command_text', COALESCE(acp.command_text, ''),
    'filled_template', COALESCE(acp.filled_template, ''),
    'command_source', COALESCE(acp.command_source, ''),
    'tool', COALESCE(acp.tool, '')
  ),
  COALESCE(acp.risk_level, 'medium'),
  CASE
    WHEN LOWER(COALESCE(acp.status, '')) IN ('approved') THEN 'approved'
    WHEN LOWER(COALESCE(acp.status, '')) IN ('denied') THEN 'denied'
    WHEN LOWER(COALESCE(acp.status, '')) IN ('expired') THEN 'expired'
    ELSE 'pending'
  END,
  COALESCE(acp.approved_by, acp.denied_by),
  COALESCE(acp.approved_at, acp.denied_at, COALESCE(acp.approved_at, acp.denied_at)),
  COALESCE(acp.expires_at, unixepoch() + 3600),
  COALESCE(acp.created_at, unixepoch())
FROM agent_command_proposals acp
WHERE acp.tenant_id IS NOT NULL;

-- ─── 3. mcp_command_suggestions → agentsam_slash_commands ─────────────────────
INSERT OR IGNORE INTO agentsam_slash_commands
  (id, slug, display_name, description, handler_type, handler_ref,
   is_active, sort_order, created_at)
SELECT
  'sc_' || lower(hex(randomblob(8))),
  COALESCE(NULLIF(TRIM(m.intent_slug), ''), lower(replace(m.label, ' ', '_'))),
  m.label,
  COALESCE(m.description, ''),
  CASE
    WHEN LOWER(COALESCE(m.routed_to_agent, '')) LIKE '%tool%' THEN 'tool_invoke'
    WHEN LOWER(COALESCE(m.routed_to_agent, '')) LIKE '%db%'
      OR LOWER(COALESCE(m.routed_to_agent, '')) LIKE '%query%' THEN 'db_query'
    WHEN LOWER(COALESCE(m.routed_to_agent, '')) LIKE '%sub%'
      OR LOWER(COALESCE(m.routed_to_agent, '')) LIKE '%agent%' THEN 'subagent_spawn'
    ELSE 'builtin'
  END,
  m.routed_to_agent,
  1,
  COALESCE(m.sort_order, 50),
  datetime('now')
FROM mcp_command_suggestions m;

-- ─── 4. agent_costs → agentsam_usage_events (historical copy; dual-write code paths remain) ─
INSERT OR IGNORE INTO agentsam_usage_events
  (id, tenant_id, workspace_id, agent_name, provider, model, model_key,
   tokens_in, tokens_out, total_tokens, cost_usd, status, event_type, ref_table, ref_id, created_at)
SELECT
  'ue_' || lower(hex(randomblob(8))),
  COALESCE(c.tenant_id, 'legacy_agent_costs'),
  COALESCE(c.workspace_id, 'ws_inneranimalmedia'),
  'agent-sam',
  'unknown',
  COALESCE(c.model_used, 'unknown'),
  COALESCE(c.model_used, 'unknown'),
  COALESCE(c.tokens_in, 0),
  COALESCE(c.tokens_out, 0),
  COALESCE(c.tokens_in, 0) + COALESCE(c.tokens_out, 0),
  COALESCE(c.cost_usd, 0),
  'ok',
  'agent_costs_backfill',
  'agent_costs',
  c.id,
  CASE
    WHEN typeof(c.created_at) = 'integer' THEN c.created_at
    ELSE COALESCE(unixepoch(c.created_at), unixepoch())
  END
FROM agent_costs c
WHERE COALESCE(c.cost_usd, 0) > 0;

-- ─── 5. ai_provider_usage → agentsam_usage_events (daily rollup rows) ───────
INSERT OR IGNORE INTO agentsam_usage_events
  (id, tenant_id, workspace_id, agent_name, provider, model, model_key,
   tokens_in, tokens_out, total_tokens, cost_usd, status, event_type, ref_table, ref_id, created_at)
SELECT
  'ue_' || lower(hex(randomblob(8))),
  'legacy_ai_provider_usage',
  'ws_inneranimalmedia',
  'rollup',
  u.provider,
  'rollup',
  u.provider,
  COALESCE(u.tokens_input, 0),
  COALESCE(u.tokens_output, 0),
  COALESCE(u.tokens_input, 0) + COALESCE(u.tokens_output, 0),
  COALESCE(u.cost_usd, 0),
  'ok',
  'provider_daily_rollup',
  'ai_provider_usage',
  u.id,
  CAST(strftime('%s', u.date || ' 12:00:00') AS INTEGER)
FROM ai_provider_usage u;
