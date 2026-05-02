-- 194: agent_workspace_state — IAM TOOLS agent workspace (env.TOOLS, vectorize_index_registry vidx_tools_agent_workspace).
-- Requires a stable agent_conversations row for FK.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/194_agent_workspace_state_iam_tools.sql

INSERT OR IGNORE INTO agent_conversations (
  id,
  user_id,
  title,
  name,
  created_at,
  updated_at,
  is_archived
) VALUES (
  'conv_iam_tools_agent_workspace',
  'usr_sam_primeaux',
  'IAM TOOLS agent workspace',
  'iam_tools_agent_workspace',
  unixepoch(),
  unixepoch(),
  0
);

INSERT OR IGNORE INTO agent_workspace_state (
  id,
  conversation_id,
  workspace_type,
  active_file,
  state_json,
  files_open,
  created_at,
  updated_at,
  last_agent_action
) VALUES (
  'state_iam_tools_agent_workspace',
  'conv_iam_tools_agent_workspace',
  'iam_tools_agent_workspace',
  'code/iam-workspace-shell.html',
  '{"vectorize_index_registry_id":"vidx_tools_agent_workspace","r2_binding":"TOOLS","r2_bucket":"tools","public_origin":"https://tools.inneranimalmedia.com","shell_r2_key":"code/iam-workspace-shell.html","monaco_prefix":"monaco/","excalidraw_prefix":"excalidraw/","not_autorag":true,"not_vectorize_index":true}',
  '["code/iam-workspace-shell.html"]',
  unixepoch(),
  unixepoch(),
  'registry_seed_194'
);
