-- 644: ExecOS + Workers AI skill (R2) + script registry refresh + stale path cleanup.
--
-- Upload first:
--   ./scripts/upload-iam-skills-autorag.sh
--   ./scripts/upload-agentsam-scripts-r2.sh
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/644_execos_workers_ai_skill_scripts_registry.sql

-- ── 1) Platform skill — ExecOS + Workers AI lanes ───────────────────────────
INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_execos_workers_ai_lanes',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'ExecOS + Workers AI lanes',
  'ExecOS dispatcher, MCP EXECOS binding, terminal lanes, AGENTSAM_WAI catalog, migration 640/643 inventory, Builds deploy law.',
  '',
  'skills/execos-workers-ai-lanes/SKILL.md',
  'workspace',
  'execos-wai',
  '["ExecOS/**","dispatcher/**","migrations/640_*","migrations/643_*","migrations/644_*","skills/execos-workers-ai-lanes/**","scripts/test/smoke-execos-chain.sh","scripts/test/smoke-workers-ai-catalog.mjs","scripts/audit/audit-workers-ai-inventory.mjs"]',
  0,
  '["exec","terminal","workers_ai","deploy","mcp","cloudflare"]',
  '["agent_general","plan","debug","deploy"]',
  NULL,
  '{}',
  'read_write',
  'terminal',
  '["execos","workers-ai","mcp","terminal","cloudflare","agentsam"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/execos-workers-ai-lanes/SKILL.md","repos":["SamPrimeaux/ExecOS","SamPrimeaux/inneranimalmedia","SamPrimeaux/inneranimalmedia-mcp-server"]}',
  1200,
  1,
  'r2',
  1,
  11,
  datetime('now'),
  datetime('now')
);

-- ── 2) New canonical scripts (R2 autorag paths) ─────────────────────────────
INSERT OR REPLACE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, preferred_for, notes, source_stored,
  created_at_epoch, updated_at_epoch
) VALUES
(
  'script_smoke_execos_chain',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'smoke_execos_chain', 'Smoke ExecOS dispatcher chain',
  'scripts/test/smoke-execos-chain.sh', '',
  'Health + POST /run (gcp) + demo models gate via execos.inneranimalmedia.com. Requires EXECOS_KEY in .env.cloudflare.',
  'test', 'bash', 'shell', '', 0, 1, 1, 1, 1, 0, 'low',
  'execos,mcp,terminal,smoke',
  'Replaces legacy pty-health slug (was wrongly mapped to dev-deploy.sh). Repo: scripts/test/smoke-execos-chain.sh',
  'r2:inneranimalmedia-autorag/scripts/test/smoke-execos-chain.sh',
  unixepoch(), unixepoch()
),
(
  'script_smoke_workers_ai_catalog',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'smoke_workers_ai_catalog', 'Smoke Workers AI catalog + execos probe',
  'scripts/test/smoke-workers-ai-catalog.mjs', '',
  'Validates execos /api/demo/models active_model_id and D1 agentsam_ai active Workers AI picker count.',
  'test', 'node', 'javascript', '', 0, 1, 1, 1, 1, 0, 'low',
  'workers_ai,execos,smoke',
  'Post migration 643 gate. Repo: scripts/test/smoke-workers-ai-catalog.mjs',
  'r2:inneranimalmedia-autorag/scripts/test/smoke-workers-ai-catalog.mjs',
  unixepoch(), unixepoch()
),
(
  'script_audit_workers_ai_inventory',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'audit_workers_ai_inventory', 'Audit Workers AI catalog vs picker',
  'scripts/audit/audit-workers-ai-inventory.mjs', '',
  'Reports catalog_active vs picker_active, duplicate model_key rows, and ExecOS minimax/glm status.',
  'audit', 'node', 'javascript', '', 0, 1, 1, 1, 1, 0, 'low',
  'workers_ai,audit,d1',
  'Run after agentsam_model_catalog / agentsam_ai migrations. Repo: scripts/audit/audit-workers-ai-inventory.mjs',
  'r2:inneranimalmedia-autorag/scripts/audit/audit-workers-ai-inventory.mjs',
  unixepoch(), unixepoch()
);

-- ── 3) Retire stale / mis-mapped scripts ────────────────────────────────────
UPDATE agentsam_scripts
SET is_active = 0,
    safe_to_run = 0,
    notes = COALESCE(notes, '') || ' | RETIRED 644: wrong path (dev-deploy). Use smoke_execos_chain.',
    updated_at_epoch = unixepoch()
WHERE slug = 'pty-health';

UPDATE agentsam_scripts
SET notes = 'R2 lane path scripts/ingest/… · canonical repo: scripts/reindex_codebase_dashboard_agent.mjs',
    updated_at_epoch = unixepoch()
WHERE slug = 'reindex_codebase_dashboard_agent';

UPDATE agentsam_scripts
SET notes = 'R2 lane path scripts/maintenance/… · canonical repo: scripts/populate-autorag.sh',
    updated_at_epoch = unixepoch()
WHERE slug = 'populate_autorag';

UPDATE agentsam_scripts
SET notes = 'R2 lane path scripts/maintenance/… · canonical repo: scripts/with-cloudflare-env.sh',
    updated_at_epoch = unixepoch()
WHERE slug = 'with_cloudflare_env';

-- ── 4) Fix platform context metadata typo (agentsam_skills → agentsam_skill) ─
UPDATE agentsam_project_context
SET secondary_tables = REPLACE(secondary_tables, 'agentsam_skills', 'agentsam_skill'),
    updated_at = unixepoch()
WHERE id = 'ctx_inneranimalmedia'
  AND secondary_tables LIKE '%agentsam_skills%';

-- ── 5) Stamp ExecOS routing hints on catalog (idempotent) ───────────────────
UPDATE agentsam_model_catalog
SET cost_notes = 'role=execos_demo_primary;p=940|644 skill registered;await CF @cf/minimax/m3 enrollment.'
WHERE model_key = 'wai-minimax-m3';

UPDATE agentsam_model_catalog
SET cost_notes = 'role=execos_fallback_primary;p=930|644 skill registered;ExecOS probe default.'
WHERE model_key = '@cf/zai-org/glm-4.7-flash';
