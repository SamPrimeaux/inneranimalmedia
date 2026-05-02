-- 113: Ensure cloudflare_deployments and workflow_checkpoints exist (post-deploy recording, overview checkpoints)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/113_cloudflare_deployments_and_checkpoints.sql
-- Purpose: Every deploy can insert into cloudflare_deployments via scripts/post-deploy-record.sh; checkpoints give realtime alignment and reduce backtracking.

CREATE TABLE IF NOT EXISTS cloudflare_deployments (
  deployment_id TEXT,
  worker_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  deployment_type TEXT NOT NULL DEFAULT 'worker',
  environment TEXT NOT NULL DEFAULT 'production',
  status TEXT NOT NULL DEFAULT 'success',
  deployment_url TEXT,
  preview_url TEXT,
  triggered_by TEXT,
  deployed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cloudflare_deployments_worker_deployed ON cloudflare_deployments(worker_name, deployed_at DESC);

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_updated ON workflow_checkpoints(updated_at DESC);
