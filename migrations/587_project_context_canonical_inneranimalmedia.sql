-- 587: One canonical active project context per ws_inneranimalmedia.
-- id/project_key align with Worker name: ctx_inneranimalmedia / inneranimalmedia
-- Retires ctx_iam_platform (iam-platform key) and archives other active rows.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/587_project_context_canonical_inneranimalmedia.sql

-- Promote canonical row (copy body from ctx_iam_platform when present)
INSERT OR REPLACE INTO agentsam_project_context (
  id, tenant_id, workspace_id, project_key, project_name, project_type,
  status, priority, description, goals, constraints, current_blockers,
  primary_tables, secondary_tables, workers_involved, r2_buckets_involved,
  domains_involved, mcp_services_involved, key_files, related_routes,
  tokens_budgeted, tokens_used, cost_usd, linked_plan_id, linked_todo_ids,
  agent_id, client_id, session_id, created_by, notes,
  started_at, target_completion, completed_at, created_at, updated_at
)
SELECT
  'ctx_inneranimalmedia',
  tenant_id,
  workspace_id,
  'inneranimalmedia',
  'inneranimalmedia Worker — Platform Master',
  COALESCE(NULLIF(trim(project_type), ''), 'platform_master'),
  'active',
  100,
  CASE
    WHEN instr(description, 'Core stack:') > 0 THEN
      'Cloudflare Worker `inneranimalmedia` (inneranimalmedia.com). '
      || substr(description, instr(description, 'Core stack:'))
    ELSE description
  END,
  goals,
  constraints,
  current_blockers,
  primary_tables,
  secondary_tables,
  workers_involved,
  r2_buckets_involved,
  domains_involved,
  mcp_services_involved,
  key_files,
  related_routes,
  tokens_budgeted,
  0,
  cost_usd,
  linked_plan_id,
  linked_todo_ids,
  agent_id,
  client_id,
  session_id,
  created_by,
  'Canonical platform master context (587). Worker name = inneranimalmedia.',
  started_at,
  target_completion,
  completed_at,
  COALESCE(created_at, unixepoch()),
  unixepoch()
FROM agentsam_project_context
WHERE id = 'ctx_iam_platform';

-- Fresh-env fallback when ctx_iam_platform never existed
INSERT OR IGNORE INTO agentsam_project_context (
  id, tenant_id, workspace_id, project_key, project_name, project_type,
  status, priority, description, workers_involved, cost_usd, created_at, updated_at
) VALUES (
  'ctx_inneranimalmedia',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'inneranimalmedia',
  'inneranimalmedia Worker — Platform Master',
  'platform_master',
  'active',
  100,
  'Cloudflare Worker `inneranimalmedia` (inneranimalmedia.com). D1 inneranimalmedia-business, R2 inneranimalmedia + inneranimalmedia-autorag, Supabase agentsam pgvector, AGENTSAM_VECTORIZE_* lanes.',
  'inneranimalmedia,inneranimalmedia-mcp-server',
  0,
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_project_context
SET
  status = 'archived',
  priority = 0,
  updated_at = unixepoch(),
  notes = trim(COALESCE(notes, '') || ' [archived 587 → ctx_inneranimalmedia]')
WHERE id = 'ctx_iam_platform';

UPDATE agentsam_project_context
SET
  status = 'archived',
  priority = 0,
  updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND id != 'ctx_inneranimalmedia'
  AND status = 'active';
