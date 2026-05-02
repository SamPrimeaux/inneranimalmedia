-- 187: workspace_projects — wp_inneranimalmedia for ws_inneranimalmedia (1 row).
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/187_workspace_projects_wp_inneranimalmedia.sql

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
  'wp_inneranimalmedia',
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  'usr_sam_primeaux',
  'ai_sam_v1',
  'Inner Animal Media',
  'inneranimalmedia',
  'Primary IAM workspace: dashboard, agent, worker, and platform APIs.',
  'Inner Animal Media',
  'internal',
  'active',
  0,
  '{"primaryDomain":"inneranimalmedia.com"}',
  unixepoch(),
  unixepoch()
);
