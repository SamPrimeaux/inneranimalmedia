-- 802: project_costs — per-project AI spend with token/model/quality metrics.
-- Legacy rows (monthly allocations) keep working; new rows capture line-item usage.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/802_project_costs_usage_metrics.sql

ALTER TABLE project_costs ADD COLUMN workspace_id TEXT;
ALTER TABLE project_costs ADD COLUMN tenant_id TEXT;
ALTER TABLE project_costs ADD COLUMN user_id TEXT;
ALTER TABLE project_costs ADD COLUMN provider TEXT;
ALTER TABLE project_costs ADD COLUMN model_key TEXT;
ALTER TABLE project_costs ADD COLUMN task_type TEXT;
ALTER TABLE project_costs ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_costs ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_costs ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_costs ADD COLUMN quality_tier TEXT;
ALTER TABLE project_costs ADD COLUMN quality_score REAL;
ALTER TABLE project_costs ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE project_costs ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE project_costs ADD COLUMN source_id TEXT;
ALTER TABLE project_costs ADD COLUMN routing_arm_id TEXT;
ALTER TABLE project_costs ADD COLUMN image_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_costs ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_project_costs_model ON project_costs(model_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_costs_task ON project_costs(task_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_costs_source ON project_costs(source_kind, source_id);
