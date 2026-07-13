-- 901_agentsam_cron_triage_log.sql
-- Per-email visibility into the daily-memory-pipeline cron triage step
-- (evening_memory_email / morning_focus_email). Child of agentsam_cron_runs
-- via cron_run_id -- NOT stuffed into agentsam_cron_runs.metadata_json, and
-- NOT agentsam_tool_call_log (cron triage is not a chat tool-loop turn).

CREATE TABLE IF NOT EXISTS agentsam_cron_triage_log (
  id TEXT PRIMARY KEY,
  cron_run_id TEXT NOT NULL,
  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,
  email_id TEXT,
  account TEXT,
  model_key TEXT,
  source TEXT,              -- 'gemini' | 'flash_lite_fallback' | 'deploy_email_parser' | 'error'
  label TEXT,                -- primary|updates|action|fyi
  urgency TEXT,              -- critical|high|normal|low|fyi
  needs_action INTEGER,
  suggested_action TEXT,
  project_tag TEXT,
  latency_ms INTEGER,
  error_message TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_cron_triage_log_run
  ON agentsam_cron_triage_log(cron_run_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_cron_triage_log_tenant_created
  ON agentsam_cron_triage_log(tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_agentsam_cron_triage_log_model_created
  ON agentsam_cron_triage_log(model_key, created_at);
