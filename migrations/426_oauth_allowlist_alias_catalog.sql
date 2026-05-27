-- 426: OAuth allowlist gap — point capability aliases at live agentsam_tools.tool_key rows.
-- Root cause: aliases targeted legacy keys (workflow_run_pipeline, spend_summary, …) so
-- tools/list resolved handlers that were missing or failed MCP catalog validation.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/426_oauth_allowlist_alias_catalog.sql

-- Identity aliases (public OAuth name = catalog tool_key row)
UPDATE agentsam_capability_aliases
SET match_value = abstract_capability,
    rationale = COALESCE(rationale, '') || ' | 426: OAuth identity alias',
    is_active = 1
WHERE match_kind = 'tool_key'
  AND abstract_capability IN (
    'agentsam_workflow_status',
    'agentsam_memory_search',
    'agentsam_spend_summary',
    'agentsam_notify',
    'agentsam_drive_read',
    'agentsam_daily_summary',
    'agentsam_run',
    'agentsam_plan',
    'agentsam_todo_add'
  );

-- memory_save → agentsam_memory_write (canonical write row)
UPDATE agentsam_capability_aliases
SET match_value = 'agentsam_memory_write',
    rationale = COALESCE(rationale, '') || ' | 426: memory_save → agentsam_memory_write',
    is_active = 1
WHERE match_kind = 'tool_key'
  AND abstract_capability = 'agentsam_memory_save';

-- MCP catalog validation: handler_config.operation required for tools/list
UPDATE agentsam_tools
SET handler_config = json_patch(handler_config, '{"operation":"searchMemory"}'),
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_search'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_tools
SET handler_config = json_patch(handler_config, '{"operation":"memory_write"}'),
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_write'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';
