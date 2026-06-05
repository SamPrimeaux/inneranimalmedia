-- Plan Mode intake: persisted question batches (pre-plan, mid-plan, roadblock).
-- D1 SSOT; answers resume planning via POST /api/agent/plan/intake/submit.

CREATE TABLE IF NOT EXISTS agentsam_plan_intake_batches (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  workspace_id        TEXT NOT NULL,
  user_id             TEXT,
  session_id          TEXT,
  phase               TEXT NOT NULL DEFAULT 'pre_plan'
                      CHECK (phase IN ('pre_plan', 'mid_plan', 'roadblock')),
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'answered', 'skipped', 'expired', 'superseded')),
  goal_text           TEXT NOT NULL,
  explore_summary_json TEXT,
  questions_json      TEXT NOT NULL DEFAULT '[]',
  answers_json        TEXT,
  optional_details    TEXT,
  plan_id             TEXT,
  workflow_run_id     TEXT,
  parent_batch_id     TEXT,
  roadblock_context_json TEXT,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  answered_at         INTEGER,
  expires_at          INTEGER
);

CREATE INDEX IF NOT EXISTS idx_plan_intake_ws_session_status
  ON agentsam_plan_intake_batches (workspace_id, session_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_intake_plan
  ON agentsam_plan_intake_batches (plan_id)
  WHERE plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plan_intake_pending
  ON agentsam_plan_intake_batches (workspace_id, user_id, status)
  WHERE status = 'pending';
