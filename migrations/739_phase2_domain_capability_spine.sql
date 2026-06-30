-- 739: Phase 2 — domain.capability tool spine (filesystem/deploy activation + route domains).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/739_phase2_domain_capability_spine.sql
-- Verify: node scripts/verify-route-domain-catalog.mjs

-- ── Route requirements: allowed_domains_json (SSOT; lanes become legacy hints) ──
ALTER TABLE agentsam_route_requirements ADD COLUMN allowed_domains_json TEXT;

UPDATE agentsam_route_requirements
SET
  allowed_domains_json = '[
    "filesystem","terminal","github","git","database.d1","deploy",
    "knowledge","memory","browser","cloudflare","agent"
  ]',
  allowed_lanes_json = '["develop","inspect","research","terminal"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '[
    "filesystem.read","filesystem.write","filesystem.list",
    "workspace_read_file","workspace_search","code.search","file.read","grep",
    "github.read","github.write","github_file","github_repos",
    "d1.read","d1_query","d1.schema","terminal.execute","terminal_execute",
    "deploy.execute","context.search","memory.search","knowledge_search"
  ]'
WHERE route_key = 'agent'
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_route_requirements
SET
  allowed_domains_json = '["filesystem","github","git","knowledge","database.d1","browser"]',
  allowed_lanes_json = '["inspect","develop","research","observe"]'
WHERE route_key IN ('multitask', 'readonly_repo_audit', 'ask_evidence_child', 'multitask_report_child')
  AND COALESCE(is_active, 1) = 1;

-- ── Archive duplicate / hardcoded-path filesystem rows ──
UPDATE agentsam_tools
SET
  is_active = 0,
  is_degraded = 1,
  updated_at = unixepoch()
WHERE tool_key IN (
  'pty_fs_read',
  'pty_fs_write',
  'workspace_read_file',
  'workspace_write_file',
  'workspace_list_files',
  'write_file',
  'read_file',
  'list_dir'
);

-- ── Canonical filesystem tools: domain.capability + active ──
UPDATE agentsam_tools
SET
  tool_category = 'filesystem.read',
  is_active = 1,
  is_degraded = 0,
  handler_type = COALESCE(NULLIF(trim(handler_type), ''), 'filesystem'),
  handler_config = json_patch(
    CASE
      WHEN handler_config IS NULL OR trim(handler_config) IN ('', '{}') THEN '{}'
      ELSE handler_config
    END,
    '{"auth_source":"platform","binding":"internal","platform_bindingless":true,"dispatcher":"fs_read_file","operation":"read"}'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'fs_read_file';

UPDATE agentsam_tools
SET
  tool_category = 'filesystem.write',
  is_active = 1,
  is_degraded = 0,
  requires_approval = 1,
  risk_level = COALESCE(NULLIF(trim(risk_level), ''), 'high'),
  handler_type = COALESCE(NULLIF(trim(handler_type), ''), 'filesystem'),
  handler_config = json_patch(
    CASE
      WHEN handler_config IS NULL OR trim(handler_config) IN ('', '{}') THEN '{}'
      ELSE handler_config
    END,
    '{"auth_source":"platform","binding":"internal","platform_bindingless":true,"dispatcher":"fs_write_file","operation":"write"}'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'fs_write_file';

UPDATE agentsam_tools
SET
  tool_category = 'filesystem.search',
  is_active = COALESCE(is_active, 1),
  updated_at = unixepoch()
WHERE tool_key IN ('fs_search_files', 'agentsam_workspace_search');

UPDATE agentsam_tools
SET
  tool_category = 'filesystem.edit',
  updated_at = unixepoch()
WHERE tool_key = 'fs_edit_file';

-- ── Bulk rename legacy undotted categories → domain.capability ──
UPDATE agentsam_tools SET tool_category = 'terminal.execute', updated_at = unixepoch()
WHERE lower(trim(tool_category)) IN ('terminal', 'shell', 'container')
  AND lower(trim(COALESCE(handler_type, ''))) IN ('terminal', 'builtin', 'container');

UPDATE agentsam_tools SET tool_category = 'github.read', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'github'
  AND (tool_key LIKE '%read%' OR tool_key LIKE '%get%' OR tool_key LIKE '%list%' OR tool_key LIKE '%search%');

UPDATE agentsam_tools SET tool_category = 'github.write', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'github'
  AND (tool_key LIKE '%write%' OR tool_key LIKE '%create%' OR tool_key LIKE '%merge%' OR tool_key LIKE '%delete%' OR tool_key LIKE '%pr%');

UPDATE agentsam_tools SET tool_category = 'github.execute', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'github'
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'deploy.execute', updated_at = unixepoch()
WHERE lower(trim(tool_category)) IN ('deploy', 'operate')
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'memory.search', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'memory'
  AND (tool_key LIKE '%search%' OR tool_key LIKE '%recall%')
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'memory.write', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'memory'
  AND (tool_key LIKE '%save%' OR tool_key LIKE '%write%')
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'memory.read', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'memory'
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'browser.inspect', updated_at = unixepoch()
WHERE lower(trim(tool_category)) IN ('browser', 'ui', 'inspect')
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'knowledge.search', updated_at = unixepoch()
WHERE lower(trim(tool_category)) IN ('knowledge', 'context', 'research')
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'cloudflare.execute', updated_at = unixepoch()
WHERE lower(trim(tool_category)) IN ('cloudflare', 'platform', 'cf')
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'agent.execute', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'agent'
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'integrations.execute', updated_at = unixepoch()
WHERE lower(trim(tool_category)) IN ('integrations', 'email')
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'workflow.execute', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'workflow'
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'media.execute', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'media'
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'cms.execute', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'cms'
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'storage.read', updated_at = unixepoch()
WHERE lower(trim(tool_category)) IN ('storage', 'r2')
  AND tool_category NOT LIKE '%.%';

-- Already-dotted rows: normalize common legacy prefixes
UPDATE agentsam_tools SET tool_category = 'database.d1.read', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'database.d1'
  AND (tool_key LIKE '%read%' OR tool_key LIKE '%query%' OR tool_key LIKE '%schema%');

UPDATE agentsam_tools SET tool_category = 'database.d1.write', updated_at = unixepoch()
WHERE lower(trim(tool_category)) = 'database.d1'
  AND tool_category NOT LIKE '%.%';

UPDATE agentsam_tools SET tool_category = 'database.supabase.read', updated_at = unixepoch()
WHERE lower(trim(tool_category)) IN ('database.supabase', 'database.hyperdrive')
  AND tool_category NOT LIKE '%.%';

-- ── Guardrail view: domains declared by routes vs active catalog coverage ──
DROP VIEW IF EXISTS v_agentsam_route_domain_coverage;
CREATE VIEW v_agentsam_route_domain_coverage AS
WITH route_domains AS (
  SELECT
    rr.route_key,
    json_each.value AS domain
  FROM agentsam_route_requirements rr,
       json_each(json(rr.allowed_domains_json))
  WHERE rr.allowed_domains_json IS NOT NULL
    AND trim(rr.allowed_domains_json) NOT IN ('', '[]')
),
active_domains AS (
  SELECT DISTINCT
    CASE
      WHEN instr(lower(trim(tool_category)), '.') > 0
        THEN substr(lower(trim(tool_category)), 1, instr(lower(trim(tool_category)), '.') - 1)
      ELSE lower(trim(tool_category))
    END AS domain
  FROM agentsam_tools
  WHERE COALESCE(is_active, 1) = 1
    AND COALESCE(is_degraded, 0) = 0
)
SELECT
  rd.route_key,
  rd.domain,
  CASE WHEN ad.domain IS NOT NULL THEN 1 ELSE 0 END AS has_active_tools
FROM route_domains rd
LEFT JOIN active_domains ad ON ad.domain = lower(trim(rd.domain));
