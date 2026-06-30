-- 735: Align MY_CONTAINER pool id with worker name; restore GCP operator repo spine for remote terminal.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/735_container_pool_and_remote_exec_spine.sql

UPDATE agentsam_tools
SET handler_config = json_set(
      json_set(
        COALESCE(handler_config, '{}'),
        '$.pool_id', 'inneranimalmedia'
      ),
      '$.image_tag', 'sandbox-v3'
    ),
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_container_exec';

UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.image_tag', 'sandbox-v3'
    ),
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_sandbox';

-- Operator workspace: GCP clone path for agentsam_terminal_remote (733 removed vm_* fields)
UPDATE workspace_settings
SET settings_json = json_set(
      json_set(
        json_set(
          json_set(
            COALESCE(settings_json, '{}'),
            '$.vm_workspace_root', '/home/samprimeaux/inneranimalmedia'
          ),
          '$.vm_workspace_cd_command', 'cd /home/samprimeaux/inneranimalmedia'
        ),
        '$.repo.vm_path', '/home/samprimeaux/inneranimalmedia'
      ),
      '$.execos_home', '/home/samprimeaux/ExecOS'
    ),
    updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';
