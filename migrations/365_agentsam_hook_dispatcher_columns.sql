-- agentsam_hook columns required by src/core/hook-dispatcher.js (fireAgentHooks)
-- On prod D1 (2026-05-20): hook_key/handler_type/handler_config/priority already applied.
-- If re-running: skip ALTER lines that error with duplicate column name.

-- ALTER TABLE agentsam_hook ADD COLUMN hook_key TEXT;
-- ALTER TABLE agentsam_hook ADD COLUMN handler_type TEXT DEFAULT 'log_only';
-- ALTER TABLE agentsam_hook ADD COLUMN handler_config TEXT DEFAULT '{}';
-- ALTER TABLE agentsam_hook ADD COLUMN priority INTEGER DEFAULT 100;

UPDATE agentsam_hook
SET hook_key = id
WHERE hook_key IS NULL OR trim(hook_key) = '';

UPDATE agentsam_hook
SET handler_type = 'webhook',
    handler_config = json_object('url', substr(command, length('notify:webhook:') + 1))
WHERE command LIKE 'notify:webhook:%';

UPDATE agentsam_hook
SET handler_type = 'workers_deploy',
    handler_config = json_object('command', command)
WHERE command IN ('trigger:agent_sam_deploy_hook', 'trigger:workers_deploy_hook');

UPDATE agentsam_hook
SET handler_type = 'usage_event',
    handler_config = '{}'
WHERE (command IS NULL OR trim(command) = '')
  AND COALESCE(event_type, trigger) IN ('agent_run_complete', 'stop');

UPDATE agentsam_hook
SET handler_type = 'log_only',
    handler_config = json_object('command', COALESCE(command, ''))
WHERE handler_type = 'log_only'
  AND (handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}');

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_event_active
  ON agentsam_hook(event_type, is_active, priority);
