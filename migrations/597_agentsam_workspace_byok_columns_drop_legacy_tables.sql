-- 597: agentsam_workspace BYOK columns + archive duplicate MCP ws + drop superseded tables.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/597_agentsam_workspace_byok_columns_drop_legacy_tables.sql

PRAGMA foreign_keys = OFF;

-- ── Queryable BYOK / deploy columns on SSOT workspace row ───────────────────
ALTER TABLE agentsam_workspace ADD COLUMN cloudflare_account_id TEXT;
ALTER TABLE agentsam_workspace ADD COLUMN byok_r2_bucket TEXT;
ALTER TABLE agentsam_workspace ADD COLUMN deploy_url TEXT;

UPDATE agentsam_workspace
SET cloudflare_account_id = json_extract(metadata_json, '$.cloudflare_account_id')
WHERE json_extract(metadata_json, '$.cloudflare_account_id') IS NOT NULL;

UPDATE agentsam_workspace
SET cloudflare_account_id = json_extract(metadata_json, '$.cf_account_id')
WHERE cloudflare_account_id IS NULL
  AND json_extract(metadata_json, '$.cf_account_id') IS NOT NULL;

UPDATE agentsam_workspace
SET byok_r2_bucket = json_extract(metadata_json, '$.byok_r2_bucket')
WHERE json_extract(metadata_json, '$.byok_r2_bucket') IS NOT NULL;

UPDATE agentsam_workspace
SET deploy_url = json_extract(metadata_json, '$.deploy_url')
WHERE json_extract(metadata_json, '$.deploy_url') IS NOT NULL;

UPDATE agentsam_workspace
SET deploy_url = json_extract(metadata_json, '$.live_url')
WHERE deploy_url IS NULL
  AND json_extract(metadata_json, '$.live_url') IS NOT NULL;

UPDATE agentsam_workspace
SET deploy_url = 'https://mcp.inneranimalmedia.com'
WHERE id = 'ws_inneranimalmedia_mcp'
  AND (deploy_url IS NULL OR trim(deploy_url) = '');

-- ── Duplicate MCP workspace (canonical: ws_inneranimalmedia_mcp) ──────────────
UPDATE agentsam_workspace
SET status = 'archived',
    updated_at = unixepoch()
WHERE id = 'ws_iam_mcp';

UPDATE workspaces
SET status = 'archived',
    is_archived = 1,
    name = 'IAM MCP Server (legacy — use ws_inneranimalmedia_mcp)',
    updated_at = unixepoch()
WHERE id = 'ws_iam_mcp';

-- ── Superseded tables (0 rows; replaced by user_storage_access_keys + workspace_settings) ─
DROP TABLE IF EXISTS agentsam_workspace_data_bindings;
DROP TABLE IF EXISTS user_workspace_settings;
DROP TABLE IF EXISTS workspace_tool_access;

PRAGMA foreign_keys = ON;
