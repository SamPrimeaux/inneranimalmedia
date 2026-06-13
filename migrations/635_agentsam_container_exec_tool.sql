-- 635: agentsam_container_exec — MY_CONTAINER batch exec from Agent Sam chat
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/635_agentsam_container_exec_tool.sql

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global,
  oauth_visible, modes_json, updated_at
) VALUES (
  'ast_agentsam_container_exec',
  'agentsam_container_exec',
  'agentsam_container_exec',
  'Container Batch Exec',
  'container.exec',
  'terminal',
  'Run a non-interactive shell command in the Cloudflare MY_CONTAINER cloud sandbox (Alpine Linux, batch exec). Use when the user asks for cloud sandbox, container lane, or batch exec (e.g. uname -a). NOT for interactive shells — use agentsam_terminal_local or agentsam_terminal_remote for PTY/tunnel shells. Platform operators only.',
  '{"type":"object","properties":{"command":{"type":"string","description":"Shell command inside the cloud container (e.g. uname -a)."},"cwd":{"type":"string","description":"Optional cwd inside container (default /tmp)."},"timeout_ms":{"type":"integer","description":"Optional timeout ms."}},"required":["command"],"additionalProperties":false}',
  '{"auth_source":"platform","target_type":"my_container","binding":"MY_CONTAINER","pool_id":"meaux-pool","image_tag":"sandbox-v2"}',
  'container.exec',
  'high',
  0,
  0,
  1,
  0,
  '["*"]',
  55,
  1,
  0,
  '["agent","debug","multitask"]',
  unixepoch()
);

INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order, notes)
VALUES
  ('atpk_chat_container_exec', 'agent_chat_essential', 'agentsam_container_exec', 47, 'MY_CONTAINER batch exec (platform operators)');

INSERT INTO agentsam_capability_aliases (
  abstract_capability,
  match_kind,
  match_value,
  capability_lane,
  priority,
  requires_approval,
  is_mutation,
  rationale
)
VALUES
  (
    'container.exec',
    'tool_key',
    'agentsam_container_exec',
    'terminal',
    10,
    0,
    0,
    'Batch exec in MY_CONTAINER cloud sandbox via tryContainerExec (platform operators).'
  )
ON CONFLICT (abstract_capability, match_kind, match_value)
DO UPDATE SET
  capability_lane = excluded.capability_lane,
  priority = excluded.priority,
  requires_approval = excluded.requires_approval,
  is_mutation = excluded.is_mutation,
  rationale = excluded.rationale,
  is_active = 1,
  updated_at = datetime('now');

UPDATE agentsam_route_requirements
SET
  allowed_lanes_json = '["develop","observe","operate","terminal"]',
  optional_capability_keys_json = '["terminal.execute","wrangler.cli","logs.read","github.read","d1.read","r2.read","container.exec"]'
WHERE route_key = 'agent_terminal';

UPDATE agentsam_route_requirements
SET optional_capability_keys_json = '["memory.read","memory.search","memory.write","context.search","browser.inspect","d1.read","mcp.catalog.read","container.exec"]'
WHERE route_key IN ('agent_general', 'general', 'chat');
