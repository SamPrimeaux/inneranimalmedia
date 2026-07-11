-- Kill switch + cancel flag + workspace tool reclassification.

ALTER TABLE agentsam_agent_run ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0;

-- workspace_* are scoped file ops — not top-level OAuth catalog tools.
UPDATE agentsam_tools
SET
  oauth_visible = 0,
  workspace_scope = 'scoped_operation',
  updated_at = unixepoch()
WHERE (
  COALESCE(tool_key, tool_name, '') LIKE 'workspace_%'
  OR COALESCE(tool_name, '') LIKE 'workspace_%'
)
AND COALESCE(oauth_visible, 0) = 1;

-- Enable real-time push on $1 step alert (idempotent).
UPDATE workspace_limits
SET
  limits_json = json_set(
    limits_json,
    '$.spend_alerts[0].notify_via',
    json('["email","push"]')
  ),
  updated_at = datetime('now')
WHERE workspace_id = 'ws_inneranimalmedia'
  AND json_extract(limits_json, '$.spend_alerts[0].id') = 'iam_daily_every_1usd';
