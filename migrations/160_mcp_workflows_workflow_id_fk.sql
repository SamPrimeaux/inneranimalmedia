-- Migration 160: Optional FK from runs to workflows (SQLite: no-op if unsupported)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/160_mcp_workflows_workflow_id_fk.sql

-- D1/SQLite: explicit FK is optional; keep index-only enforcement to avoid fragile ALTER on live DB.
CREATE INDEX IF NOT EXISTS idx_mcp_workflow_runs_workflow_started ON mcp_workflow_runs(workflow_id, started_at DESC);
