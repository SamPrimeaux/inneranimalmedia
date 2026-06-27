-- cms_edit + cms_live_editor: allow terminal_execute and email tools (keep secret_write blocked).
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/721_cms_edit_allow_terminal_email.sql

UPDATE agentsam_route_requirements
SET
  task_type = COALESCE(task_type, 'cms_edit'),
  allowed_lanes_json = '["design","develop","inspect","research","terminal","operate"]',
  optional_capability_keys_json = '["context_search","d1_query","workspace_read_file","knowledge_search","terminal_execute","terminal_run","email_broadcast","send_email","resend_send_email","cms_pipeline_prototype","web_fetch","browser_inspect","mcp_catalog_read","github.read","code.search"]',
  blocked_capability_keys_json = '["secret_write","secret.write"]',
  max_tools = 14
WHERE route_key = 'cms_edit';

UPDATE agentsam_route_requirements
SET
  allowed_lanes_json = '["design","develop","inspect","research","terminal","operate"]',
  optional_capability_keys_json = '["context_search","d1_read","d1_query","mcp_catalog_read","workspace_read","workspace_read_file","knowledge_search","terminal_execute","terminal_run","email_broadcast","send_email","resend_send_email","cms_pipeline_prototype","web_fetch","browser_inspect"]',
  blocked_capability_keys_json = '["secret_write","secret.write"]',
  max_tools = 14
WHERE route_key = 'cms_live_editor._default_protocol';

-- Specialized cms_live_editor.* rows: keep deploy/d1-write blocks; drop terminal + email blocks.
UPDATE agentsam_route_requirements
SET blocked_capability_keys_json = '["worker.deploy","d1.write","secret_write","secret.write"]'
WHERE route_key LIKE 'cms_live_editor.%'
  AND route_key != 'cms_live_editor._default_protocol';
