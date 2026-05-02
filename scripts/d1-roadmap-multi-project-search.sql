-- Multi-project semantic search — roadmap_steps for plan_iam_dashboard_v1
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-roadmap-multi-project-search.sql
--
-- Note: status uses not_started (not "planned") so this row matches Worker/dashboard filters:
--   status IN ('in_progress', 'not_started')

INSERT OR REPLACE INTO roadmap_steps (id, plan_id, tenant_id, title, description, status, order_index, created_at, updated_at)
VALUES
(
  'step_multi_project_search',
  'plan_iam_dashboard_v1',
  'tenant_sam_primeaux',
  'Multi-project semantic search',
  'Extend generate-worker-function-index.mjs to accept --repo and --output flags. Run against all active projects. Upload to AutoRAG under code/{project}-function-index.json. Agent Sam searches all projects from one interface.',
  'not_started',
  95,
  datetime('now'),
  datetime('now')
);
