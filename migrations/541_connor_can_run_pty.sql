-- Enable dashboard PTY for Connor McNeely (self-service tunnel provision + activate).
-- Canonical ids: au_5d17673408aaebc7 / ws_connor_mcneely / tenant_connor_mcneely

INSERT OR IGNORE INTO agentsam_user_policy (
  user_id,
  workspace_id,
  tenant_id,
  can_run_pty,
  tool_risk_level_max,
  updated_at
)
VALUES (
  'au_5d17673408aaebc7',
  'ws_connor_mcneely',
  'tenant_connor_mcneely',
  1,
  'high',
  datetime('now')
);

UPDATE agentsam_user_policy
SET
  can_run_pty = 1,
  tenant_id = COALESCE(tenant_id, 'tenant_connor_mcneely'),
  tool_risk_level_max = COALESCE(NULLIF(trim(tool_risk_level_max), ''), 'high'),
  updated_at = datetime('now')
WHERE user_id = 'au_5d17673408aaebc7'
  AND workspace_id = 'ws_connor_mcneely';

-- Legacy slug row from early scripts (connor_mcneely) — keep in sync if present.
UPDATE agentsam_user_policy
SET can_run_pty = 1, updated_at = datetime('now')
WHERE user_id = 'connor_mcneely'
  AND workspace_id = 'ws_connor_mcneely';
