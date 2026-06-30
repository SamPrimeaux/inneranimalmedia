-- 736: Document GCP iam-tunnel sparse partial clone in workspace SSOT (not a full mirror).
--
-- Mac root_path stays /Users/samprimeaux/inneranimalmedia (local lane).
-- vm_path / vm_layout describe the Linux sparse checkout for agentsam_terminal_remote.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/736_ws_inneranimalmedia_vm_sparse_metadata.sql

UPDATE agentsam_workspace
SET metadata_json = json_set(
      json_set(
        json_set(
          json_set(
            COALESCE(metadata_json, '{}'),
            '$.repo.vm_path', '/home/samprimeaux/inneranimalmedia'
          ),
          '$.repo.vm_layout', 'sparse_partial'
        ),
        '$.repo.vm_sparse_paths', json('["src","dashboard/src","scripts"]')
      ),
      '$.repo.vm_lane_role', 'git_shell_remote'
    ),
    updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE workspace_settings
SET settings_json = json_set(
      json_set(
        json_set(
          json_set(
            COALESCE(settings_json, '{}'),
            '$.vm_workspace_root', '/home/samprimeaux/inneranimalmedia'
          ),
          '$.vm_workspace_layout', 'sparse_partial'
        ),
        '$.vm_sparse_paths', json('["src","dashboard/src","scripts"]')
      ),
      '$.vm_lane_notes', 'Git/shell lane when Mac asleep — no root npm ci; heavy builds → agentsam_terminal_sandbox'
    ),
    updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';
