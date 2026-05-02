-- 129: Phase 2 - agent_execution_plans and agent_request_queue (Enhanced Agent Sam)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/129_agent_execution_plans_and_queue.sql
-- Purpose: Store execution plans (approve/reject) and request queue for plan-driven execution.

CREATE TABLE IF NOT EXISTS agent_execution_plans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'system',
  session_id TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_agent_execution_plans_session ON agent_execution_plans(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_execution_plans_status ON agent_execution_plans(status);

CREATE TABLE IF NOT EXISTS agent_request_queue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'system',
  session_id TEXT NOT NULL,
  plan_id TEXT,
  task_type TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  position INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (plan_id) REFERENCES agent_execution_plans(id)
);
CREATE INDEX IF NOT EXISTS idx_agent_request_queue_session ON agent_request_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_request_queue_status_position ON agent_request_queue(session_id, status, position);
