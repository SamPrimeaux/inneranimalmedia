-- 754: Register Agent Sam SDK as canonical D1 project; archive Gorilla Mode experiment.
-- Gorilla shell UX consolidated into github.com/SamPrimeaux/agentsam-sdk (examples/gorilla-shell).
--
-- Apply:
--   node scripts/d1-apply-pending.mjs --apply --from 754 --to 754

PRAGMA foreign_keys = OFF;

UPDATE projects
SET
  status = 'archived',
  description = 'ARCHIVED — gamified shell UX merged into agentsam-sdk examples/gorilla-shell.',
  metadata_json = json_patch(
    COALESCE(metadata_json, '{}'),
    '{"consolidated_into":"proj_agentsam_sdk","consolidated_repo":"SamPrimeaux/agentsam-sdk","archived_reason":"gorilla-mode merged into SDK CLI shell"}'
  ),
  updated_at = datetime('now')
WHERE id = 'proj_gorilla_mode';

INSERT OR IGNORE INTO projects (
  id,
  name,
  client_name,
  project_type,
  status,
  tenant_id,
  description,
  priority,
  workspace_id,
  tags_json,
  domain,
  worker_id,
  owner_user_id,
  metadata_json,
  created_at,
  updated_at
) VALUES (
  'proj_agentsam_sdk',
  'Agent Sam SDK',
  'Inner Animal Media',
  'saas-product',
  'development',
  'tenant_sam_primeaux',
  'Developer SDK + CLI — npx @inneranimalmedia/agentsam-sdk init, Gorilla Shell UX, resell/scale product lane.',
  90,
  'ws_inneranimalmedia',
  '["starred","sdk","cli","gorilla-shell","resell"]',
  'inneranimalmedia.com',
  NULL,
  'usr_sam_primeaux',
  '{"github_repo":"SamPrimeaux/agentsam-sdk","npm_package":"@inneranimalmedia/agentsam-sdk","gorilla_shell_path":"examples/gorilla-shell","legacy_repo":"InnerAnimal/gorilla-mode","company_focus":false}',
  datetime('now'),
  datetime('now')
);

UPDATE projects
SET
  name = 'Agent Sam SDK',
  client_name = COALESCE(NULLIF(TRIM(client_name), ''), 'Inner Animal Media'),
  description = 'Developer SDK + CLI — scaffold Workers, D1 agent loop, Gorilla Shell install UX. Resell/scale product.',
  workspace_id = 'ws_inneranimalmedia',
  tenant_id = COALESCE(NULLIF(TRIM(tenant_id), ''), 'tenant_sam_primeaux'),
  status = 'development',
  priority = 90,
  project_type = 'saas-product',
  tags_json = '["starred","sdk","cli","gorilla-shell","resell"]',
  metadata_json = json_patch(
    COALESCE(metadata_json, '{}'),
    '{"github_repo":"SamPrimeaux/agentsam-sdk","npm_package":"@inneranimalmedia/agentsam-sdk","gorilla_shell_path":"examples/gorilla-shell","legacy_repo":"InnerAnimal/gorilla-mode"}'
  ),
  updated_at = datetime('now')
WHERE id = 'proj_agentsam_sdk';

INSERT OR IGNORE INTO workspace_projects (
  id,
  workspace_id,
  tenant_id,
  owner_user_id,
  agent_ai_id,
  name,
  slug,
  description,
  client_company,
  project_type,
  status,
  budget_usd,
  metadata_json,
  created_at,
  updated_at
) VALUES (
  'wp_agentsam_sdk',
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  'usr_sam_primeaux',
  'ai_sam_v1',
  'Agent Sam SDK',
  'agentsam-sdk',
  'npm SDK + CLI shell — init scaffolds, Gorilla UX, MCP/PTY integration path for external developers.',
  'Inner Animal Media',
  'internal',
  'active',
  0,
  '{"projects_table_id":"proj_agentsam_sdk","github_repo":"SamPrimeaux/agentsam-sdk","npm_package":"@inneranimalmedia/agentsam-sdk","primaryDomain":"inneranimalmedia.com","gorilla_shell":"examples/gorilla-shell"}',
  unixepoch(),
  unixepoch()
);

UPDATE workspace_projects
SET
  name = 'Agent Sam SDK',
  slug = 'agentsam-sdk',
  description = 'npm SDK + CLI shell — init scaffolds, Gorilla UX, MCP/PTY integration path for external developers.',
  client_company = 'Inner Animal Media',
  project_type = 'internal',
  status = 'active',
  metadata_json = '{"projects_table_id":"proj_agentsam_sdk","github_repo":"SamPrimeaux/agentsam-sdk","npm_package":"@inneranimalmedia/agentsam-sdk","primaryDomain":"inneranimalmedia.com","gorilla_shell":"examples/gorilla-shell"}',
  updated_at = unixepoch()
WHERE id = 'wp_agentsam_sdk';

PRAGMA foreign_keys = ON;
