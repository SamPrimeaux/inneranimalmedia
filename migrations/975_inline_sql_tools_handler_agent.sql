-- 975: Platform inline-SQL tools must not use CF Studio D1 path.
-- agentsam_search_tools (and siblings) store handler_config.sql + bind_workspace
-- against env.DB — handler_type=d1 was mis-routed to executeCatalogCfD1 →
-- explicit_d1_resource_required. Prefer handler_type=agent (inline SQL lane).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/975_inline_sql_tools_handler_agent.sql

UPDATE agentsam_tools
SET
  handler_type = 'agent',
  updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND handler_type = 'd1'
  AND tool_key IN (
    'agentsam_search_tools',
    'agentsam_health_check',
    'agentsam_workspace_context',
    'agentsam_recent_errors',
    'agentsam_todo_add',
    'agentsam_todo_update',
    'agentsam_workflow_status',
    'agentsam_spend_summary'
  )
  AND trim(COALESCE(json_extract(handler_config, '$.sql'), '')) != '';
