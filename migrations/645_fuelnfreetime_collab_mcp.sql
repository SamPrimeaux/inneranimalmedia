-- 645: Fuel N Free Time — Sam + Connor MCP OAuth collaboration lane (Claude/ChatGPT).
-- Workspace D1: 9fd6ff92-e407-4b51-8b01-3c93f3845bb2 (same CF account as IAM platform).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/645_fuelnfreetime_collab_mcp.sql

PRAGMA foreign_keys = OFF;

-- ── Workspace anchor ───────────────────────────────────────────────────────────
INSERT OR IGNORE INTO workspaces (id, name, status, tenant_id, github_repo, created_at, updated_at)
VALUES (
  'ws_fuelnfreetime',
  'Fuel N Free Time',
  'active',
  'tenant_sam_primeaux',
  'SamPrimeaux/fuelnfreetime',
  datetime('now'),
  datetime('now')
);

UPDATE workspaces
SET
  name = 'Fuel N Free Time',
  tenant_id = 'tenant_sam_primeaux',
  github_repo = 'SamPrimeaux/fuelnfreetime',
  updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

-- ── Agent Sam execution profile ────────────────────────────────────────────────
INSERT OR IGNORE INTO agentsam_workspace (
  id, workspace_slug, tenant_id, name, display_name, status
) VALUES (
  'ws_fuelnfreetime',
  'fuelnfreetime',
  'tenant_sam_primeaux',
  'Fuel N Free Time',
  'Fuel N Free Time',
  'active'
);

UPDATE agentsam_workspace
SET
  workspace_slug = 'fuelnfreetime',
  tenant_id = 'tenant_sam_primeaux',
  name = 'Fuel N Free Time',
  display_name = 'Fuel N Free Time',
  root_path = '/Users/samprimeaux/fuelnfreetime',
  github_repo = 'SamPrimeaux/fuelnfreetime',
  d1_database_id = '9fd6ff92-e407-4b51-8b01-3c93f3845bb2',
  d1_binding = 'DB',
  cloudflare_account_id = 'ede6590ac0d2fb7daf155b35653457b2',
  worker_name = 'fuelnfreetime',
  r2_bucket = 'fuelnfreetime',
  r2_prefix = 'fuelnfreetime',
  workspace_ref_id = 'ws_fuelnfreetime',
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.workspace_kind', 'client_saas',
    '$.collaborators', json('["au_871d920d1233cbd1","au_5d17673408aaebc7"]'),
    '$.mcp_workspace_slug', 'fuelnfreetime',
    '$.platform_account_d1', 1
  ),
  updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

INSERT OR REPLACE INTO workspace_settings (
  workspace_id, theme_id, timezone, locale, settings_json, updated_at
) VALUES (
  'ws_fuelnfreetime',
  'theme-solarized-dark',
  'America/Chicago',
  'en-US',
  json_object(
    'workspace_root', '/Users/samprimeaux/fuelnfreetime',
    'github_repo', 'SamPrimeaux/fuelnfreetime',
    'd1_database_id', '9fd6ff92-e407-4b51-8b01-3c93f3845bb2',
    'cloudflare_account_id', 'ede6590ac0d2fb7daf155b35653457b2',
    'r2_bucket', 'fuelnfreetime',
    'worker_name', 'fuelnfreetime',
    'mcp_hint', 'Pass workspace_slug=fuelnfreetime on agentsam_d1_query from Claude/ChatGPT OAuth'
  ),
  unixepoch()
);

-- ── Collaborators (owner = rate-limit bypass + full MCP lane) ─────────────────
INSERT OR IGNORE INTO workspace_members
  (user_id, workspace_id, role, tenant_id, is_active, created_at, updated_at)
VALUES
  ('au_871d920d1233cbd1', 'ws_fuelnfreetime', 'owner', 'tenant_sam_primeaux', 1, unixepoch(), unixepoch()),
  ('au_5d17673408aaebc7', 'ws_fuelnfreetime', 'owner', 'tenant_sam_primeaux', 1, unixepoch(), unixepoch());

-- ── Connor OAuth: no personal allowlist gate + Claude/ChatGPT client rows ─────
UPDATE agentsam_user_policy
SET require_allowlist_for_mcp = 0, updated_at = unixepoch()
WHERE user_id = 'au_5d17673408aaebc7';

INSERT OR IGNORE INTO agentsam_mcp_oauth_user_client_allowlist
  (user_id, workspace_id, client_key, tenant_id, is_active, created_at, updated_at)
VALUES
  ('au_5d17673408aaebc7', 'ws_fuelnfreetime', 'chatgpt', 'tenant_sam_primeaux', 1, unixepoch(), unixepoch()),
  ('au_5d17673408aaebc7', 'ws_fuelnfreetime', 'claude',  'tenant_sam_primeaux', 1, unixepoch(), unixepoch()),
  ('au_5d17673408aaebc7', 'ws_fuelnfreetime', 'cursor',  'tenant_sam_primeaux', 1, unixepoch(), unixepoch()),
  ('au_5d17673408aaebc7', 'ws_connor_mcneely', 'chatgpt', 'tenant_connor_mcneely', 1, unixepoch(), unixepoch()),
  ('au_5d17673408aaebc7', 'ws_connor_mcneely', 'claude',  'tenant_connor_mcneely', 1, unixepoch(), unixepoch()),
  ('au_5d17673408aaebc7', 'ws_connor_mcneely', 'cursor',  'tenant_connor_mcneely', 1, unixepoch(), unixepoch());

-- ── Project row for DORA attribution (deploy + tool logs) ─────────────────────
INSERT OR IGNORE INTO projects (
  id, name, project_type, status, tenant_id, description, priority,
  workspace_id, tags_json, created_at, updated_at
) VALUES (
  'proj_fuelnfreetime',
  'Fuel N Free Time',
  'saas-product',
  'development',
  'tenant_sam_primeaux',
  'Fuel N Free Time Shopify + Workers app — Sam + Connor remote MCP dev lane',
  60,
  'ws_fuelnfreetime',
  '["fuelnfreetime","mcp","collab"]',
  datetime('now'),
  datetime('now')
);

PRAGMA foreign_keys = ON;
