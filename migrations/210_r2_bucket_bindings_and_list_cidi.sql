-- 210: Populate r2_bucket_bindings from wrangler (inneranimalmedia, inneranimal-dashboard,
-- inneranimalmedia-mcp-server, aitestsuite/meauxcad). Refresh r2_bucket_list for CIDI buckets missing from sync.
-- Account warehouse pattern: ede6590ac0d2fb7daf155b35653457b2_<bucket_name_with_hyphens>
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/210_r2_bucket_bindings_and_list_cidi.sql

-- ── inneranimalmedia (wrangler.production.toml): 7 bindings; 2 rows pre-existed ───────────
INSERT OR REPLACE INTO r2_bucket_bindings (id, worker_id, r2_bucket, s3_url, catalog_url, warehouse, created_at, updated_at) VALUES
('inneranimalmedia_splineicons', 'inneranimalmedia', 'splineicons', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/splineicons', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/splineicons', 'ede6590ac0d2fb7daf155b35653457b2_splineicons', unixepoch(), unixepoch()),
('inneranimalmedia_autorag', 'inneranimalmedia', 'autorag', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/autorag', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/autorag', 'ede6590ac0d2fb7daf155b35653457b2_autorag', unixepoch(), unixepoch()),
('inneranimalmedia_iam_docs', 'inneranimalmedia', 'iam-docs', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/iam-docs', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/iam-docs', 'ede6590ac0d2fb7daf155b35653457b2_iam-docs', unixepoch(), unixepoch()),
('inneranimalmedia_iam_platform', 'inneranimalmedia', 'iam-platform', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/iam-platform', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/iam-platform', 'ede6590ac0d2fb7daf155b35653457b2_iam-platform', unixepoch(), unixepoch()),
('inneranimalmedia_tools', 'inneranimalmedia', 'tools', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/tools', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/tools', 'ede6590ac0d2fb7daf155b35653457b2_tools', unixepoch(), unixepoch());

-- ── inneranimal-dashboard sandbox (wrangler.jsonc): ASSETS+DASHBOARD share agent-sam-sandbox-cidi ──
INSERT OR REPLACE INTO r2_bucket_bindings (id, worker_id, r2_bucket, s3_url, catalog_url, warehouse, created_at, updated_at) VALUES
('inneranimal_dashboard_binding_ASSETS', 'inneranimal_dashboard', 'agent-sam-sandbox-cidi', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/agent-sam-sandbox-cidi', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/agent-sam-sandbox-cidi', 'ede6590ac0d2fb7daf155b35653457b2_agent-sam-sandbox-cidi', unixepoch(), unixepoch()),
('inneranimal_dashboard_binding_CAD_ASSETS', 'inneranimal_dashboard', 'splineicons', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/splineicons', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/splineicons', 'ede6590ac0d2fb7daf155b35653457b2_splineicons', unixepoch(), unixepoch()),
('inneranimal_dashboard_binding_DASHBOARD', 'inneranimal_dashboard', 'agent-sam-sandbox-cidi', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/agent-sam-sandbox-cidi', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/agent-sam-sandbox-cidi', 'ede6590ac0d2fb7daf155b35653457b2_agent-sam-sandbox-cidi', unixepoch(), unixepoch()),
('inneranimal_dashboard_binding_AUTORAG_BUCKET', 'inneranimal_dashboard', 'autorag', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/autorag', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/autorag', 'ede6590ac0d2fb7daf155b35653457b2_autorag', unixepoch(), unixepoch()),
('inneranimal_dashboard_binding_DOCS_BUCKET', 'inneranimal_dashboard', 'iam-docs', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/iam-docs', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/iam-docs', 'ede6590ac0d2fb7daf155b35653457b2_iam-docs', unixepoch(), unixepoch()),
('inneranimal_dashboard_binding_R2', 'inneranimal_dashboard', 'iam-platform', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/iam-platform', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/iam-platform', 'ede6590ac0d2fb7daf155b35653457b2_iam-platform', unixepoch(), unixepoch()),
('inneranimal_dashboard_binding_TOOLS', 'inneranimal_dashboard', 'tools', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/tools', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/tools', 'ede6590ac0d2fb7daf155b35653457b2_tools', unixepoch(), unixepoch());

-- ── inneranimalmedia-mcp-server (inneranimalmedia-mcp-server/wrangler.toml) ────────────────
INSERT OR REPLACE INTO r2_bucket_bindings (id, worker_id, r2_bucket, s3_url, catalog_url, warehouse, created_at, updated_at) VALUES
('inneranimalmedia_mcp_binding_ASSETS', 'inneranimalmedia_mcp_server', 'inneranimalmedia-assets', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/inneranimalmedia-assets', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/inneranimalmedia-assets', 'ede6590ac0d2fb7daf155b35653457b2_inneranimalmedia-assets', unixepoch(), unixepoch()),
('inneranimalmedia_mcp_binding_R2', 'inneranimalmedia_mcp_server', 'iam-platform', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/iam-platform', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/iam-platform', 'ede6590ac0d2fb7daf155b35653457b2_iam-platform', unixepoch(), unixepoch()),
('inneranimalmedia_mcp_binding_DASHBOARD', 'inneranimalmedia_mcp_server', 'agent-sam', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/agent-sam', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/agent-sam', 'ede6590ac0d2fb7daf155b35653457b2_agent-sam', unixepoch(), unixepoch()),
('inneranimalmedia_mcp_binding_AUTORAG', 'inneranimalmedia_mcp_server', 'autorag', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/autorag', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/autorag', 'ede6590ac0d2fb7daf155b35653457b2_autorag', unixepoch(), unixepoch()),
('inneranimalmedia_mcp_binding_IAM_DOCS', 'inneranimalmedia_mcp_server', 'iam-docs', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/iam-docs', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/iam-docs', 'ede6590ac0d2fb7daf155b35653457b2_iam-docs', unixepoch(), unixepoch());

-- ── aitestsuite (SamPrimeaux/meauxcad wrangler.jsonc) ─────────────────────────────────────
INSERT OR REPLACE INTO r2_bucket_bindings (id, worker_id, r2_bucket, s3_url, catalog_url, warehouse, created_at, updated_at) VALUES
('aitestsuite_CAD_STORAGE', 'aitestsuite', 'cad', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/cad', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/cad', 'ede6590ac0d2fb7daf155b35653457b2_cad', unixepoch(), unixepoch()),
('aitestsuite_PLATFORM_STORAGE', 'aitestsuite', 'inneranimalmedia-assets', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/inneranimalmedia-assets', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/inneranimalmedia-assets', 'ede6590ac0d2fb7daf155b35653457b2_inneranimalmedia-assets', unixepoch(), unixepoch()),
('aitestsuite_SANDBOX', 'aitestsuite', 'agent-sam-sandbox-cidi', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/agent-sam-sandbox-cidi', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/agent-sam-sandbox-cidi', 'ede6590ac0d2fb7daf155b35653457b2_agent-sam-sandbox-cidi', unixepoch(), unixepoch()),
('aitestsuite_SPLINEICONS_STORAGE', 'aitestsuite', 'splineicons', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/splineicons', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/splineicons', 'ede6590ac0d2fb7daf155b35653457b2_splineicons', unixepoch(), unixepoch()),
('aitestsuite_TOOLS', 'aitestsuite', 'tools', 'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/tools', 'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/tools', 'ede6590ac0d2fb7daf155b35653457b2_tools', unixepoch(), unixepoch());

-- ── r2_bucket_list: ensure CIDI / IAM stack buckets present (INSERT OR IGNORE by PK bucket_name) ──
INSERT OR IGNORE INTO r2_bucket_list (bucket_name, creation_date, account_id, last_synced_at) VALUES
('agent-sam-sandbox-cidi', datetime('now'), 'ede6590ac0d2fb7daf155b35653457b2', datetime('now')),
('autorag', datetime('now'), 'ede6590ac0d2fb7daf155b35653457b2', datetime('now')),
('iam-docs', datetime('now'), 'ede6590ac0d2fb7daf155b35653457b2', datetime('now')),
('iam-platform', datetime('now'), 'ede6590ac0d2fb7daf155b35653457b2', datetime('now')),
('tools', datetime('now'), 'ede6590ac0d2fb7daf155b35653457b2', datetime('now'));
