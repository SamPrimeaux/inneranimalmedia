-- 540: Plan sub-task hierarchy + list indexes
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/540_plan_tasks_parent_and_plans_list.sql

ALTER TABLE agentsam_plan_tasks ADD COLUMN parent_task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_aptasks_parent ON agentsam_plan_tasks(plan_id, parent_task_id);

CREATE INDEX IF NOT EXISTS idx_aplans_ws_status ON agentsam_plans(workspace_id, status, updated_at DESC);
