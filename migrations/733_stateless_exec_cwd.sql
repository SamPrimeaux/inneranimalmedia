-- 733: Stateless exec — remove /workspace tenant paths and VM repo roots from D1.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/733_stateless_exec_cwd.sql

-- All terminal connections: host_default (workspace_settings.workspace_root locally; ExecOS home on GCP in code)
UPDATE terminal_connections
SET cwd_strategy = 'host_default',
    updated_at = unixepoch()
WHERE cwd_strategy = 'platform_workspace';

-- Deactivate GCP sandbox terminal lanes (no tenant filesystem on VM)
UPDATE terminal_connections
SET is_active = 0,
    is_default = 0,
    description = COALESCE(description, '') || ' [retired: stateless exec 733]',
    updated_at = unixepoch()
WHERE target_type = 'sandbox'
  AND ws_url LIKE '%sandboxterminal%';

-- ws_inneranimalmedia: remove vm_workspace_root pointing at clone paths
UPDATE workspace_settings
SET settings_json = json_remove(
  json_remove(
    json_remove(settings_json, '$.vm_workspace_root'),
    '$.vm_workspace_cd_command'
  ),
  '$.repo.vm_path'
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND settings_json IS NOT NULL;

-- Point execos metadata at ExecOS home (not a repo path)
UPDATE workspace_settings
SET settings_json = json_set(
  COALESCE(settings_json, '{}'),
  '$.execos_home', '/home/samprimeaux/ExecOS',
  '$.gcp_execos_home', '/home/samprimeaux/ExecOS'
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';
