-- 650: Model health aggregates for Inference Gateway Lite (Sprint 1B).
-- Feeds TTFT-aware routing in agent-model-resolver.js from agentsam_agent_run history.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/650_agentsam_model_health.sql

CREATE TABLE IF NOT EXISTS agentsam_model_health (
  model_key TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  p50_ttft_ms INTEGER,
  p95_ttft_ms INTEGER,
  p50_latency_ms INTEGER,
  p95_latency_ms INTEGER,
  error_rate REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  last_error_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (model_key, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_model_health_updated
  ON agentsam_model_health (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_model_health_p95
  ON agentsam_model_health (p95_ttft_ms ASC)
  WHERE p95_ttft_ms IS NOT NULL;

-- Seed placeholder rows for known interactive models (rollup cron will refresh).
INSERT INTO agentsam_model_health (model_key, workspace_id, sample_count, updated_at)
VALUES
  ('@cf/meta/llama-3.1-8b-instruct', '', 0, unixepoch()),
  ('@cf/meta/llama-3.1-70b-instruct', '', 0, unixepoch()),
  ('gpt-4.1-mini', '', 0, unixepoch()),
  ('gpt-4.1', '', 0, unixepoch()),
  ('claude-sonnet-4-20250514', '', 0, unixepoch())
ON CONFLICT(model_key, workspace_id) DO NOTHING;
