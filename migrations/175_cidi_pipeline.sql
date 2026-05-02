-- CI/CD pipeline run tracking
CREATE TABLE IF NOT EXISTS cidi_pipeline_runs (
  run_id TEXT PRIMARY KEY,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  commit_hash TEXT,
  branch TEXT DEFAULT 'main',
  env TEXT NOT NULL CHECK(env IN ('sandbox','production')),
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK(status IN ('pending','running','passed','failed','rolled_back')),
  worker_version_id TEXT,
  deploy_record_id TEXT,
  completed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-test results within a run
CREATE TABLE IF NOT EXISTS cidi_run_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES cidi_pipeline_runs(run_id),
  tool_name TEXT NOT NULL,
  test_type TEXT NOT NULL 
    CHECK(test_type IN ('invoke','agent_chat','route','d1','r2')),
  status TEXT NOT NULL 
    CHECK(status IN ('pass','fail','skip')),
  latency_ms INTEGER,
  http_status INTEGER,
  error TEXT,
  response_preview TEXT,
  tested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cidi_runs_env_status 
  ON cidi_pipeline_runs(env, status);
CREATE INDEX IF NOT EXISTS idx_cidi_results_run_id 
  ON cidi_run_results(run_id);
CREATE INDEX IF NOT EXISTS idx_cidi_results_status 
  ON cidi_run_results(status);
