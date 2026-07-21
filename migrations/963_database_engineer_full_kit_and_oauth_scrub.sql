-- 963: Real database_engineer kit + retire orphan DB profiles + scrub fake OAuth chalkboard tools.
--
-- DE profile: discover → read → write → migrate → vector → R2 backup → memory commit/search → docs.
-- Orphans d1_read / supabase_read / supabase_write had no bindings — retire.
-- Point supabase_vector task_type at database_engineer (vector folded into DE kit).
-- Keep supabase_migration as its own approval-gated lane.
--
-- OAuth chalkboard scrub (user correction):
--   workspace_context — not a real agent tool (session metadata)
--   health_check — same idea as agentsam_ping
--   search_tools — tools/list already exposes the chalkboard; catalog search is redundant there
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/963_database_engineer_full_kit_and_oauth_scrub.sql

-- ── 1. Full database_engineer kit ────────────────────────────────────────────
UPDATE agentsam_tool_profiles
SET
  tool_keys_json = '["agentsam_cf_d1_list","agentsam_d1_query","agentsam_d1_write","agentsam_d1_migrate","agentsam_supabase_query","agentsam_supabase_write","agentsam_supabase_vector","agentsam_cf_vectorize","agentsam_r2_get","agentsam_r2_put","agentsam_memory_search","agentsam_memory_commit","search_web"]',
  max_tools = 16,
  write_policy_json = '{"can_edit_files":false,"can_terminal":false,"can_d1_write":true,"can_deploy":false,"can_browser_automation":false,"can_memory_write":true}',
  notes = '963: full DE — d1_migrate, vector (supabase+cf), r2 backup, memory_search+commit (no memory_manager)',
  is_active = 1,
  updated_at = unixepoch()
WHERE profile_key = 'database_engineer';

-- ── 2. Retire orphan read/write micro-profiles ───────────────────────────────
UPDATE agentsam_tool_profiles
SET
  is_active = 0,
  notes = COALESCE(notes, '') || ' | retired 963: orphan/no bindings — superseded by database_engineer',
  updated_at = unixepoch()
WHERE profile_key IN ('d1_read', 'supabase_read', 'supabase_write');

-- Fold vector intent into DE (migration lane stays separate)
UPDATE agentsam_tool_profile_bindings
SET
  profile_key = 'database_engineer',
  priority = 1,
  is_active = 1,
  notes = '963: vector folded into database_engineer',
  updated_at = unixepoch()
WHERE task_type = 'supabase_vector';

UPDATE agentsam_tool_profiles
SET
  is_active = 0,
  notes = COALESCE(notes, '') || ' | retired 963: vector folded into database_engineer',
  updated_at = unixepoch()
WHERE profile_key = 'supabase_vector';

-- Ensure DE tools are active in catalog
UPDATE agentsam_tools
SET is_active = 1, updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_cf_d1_list',
  'agentsam_d1_query',
  'agentsam_d1_write',
  'agentsam_d1_migrate',
  'agentsam_supabase_query',
  'agentsam_supabase_write',
  'agentsam_supabase_vector',
  'agentsam_cf_vectorize',
  'agentsam_r2_get',
  'agentsam_r2_put',
  'agentsam_memory_search',
  'agentsam_memory_commit',
  'search_web'
);

-- ── 3. Scrub non-tools / redundant chalkboard entries ────────────────────────
UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  expose_on_connector = 0,
  notes = COALESCE(notes, '') || ' | 963: demoted — not a useful ChatGPT/Claude chalkboard tool',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN (
    'agentsam_workspace_context',
    'agentsam_health_check',
    'agentsam_search_tools'
  );
