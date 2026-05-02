-- agentsam_hook: user/workspace automation hooks (Settings Hooks tab; not webhook hook_subscriptions)
-- ai_routing_rules: model routing rules for Settings Routing Rules tab

CREATE TABLE IF NOT EXISTS agentsam_hook (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  trigger TEXT NOT NULL,
  command TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (trigger IN ('start', 'stop', 'pre_deploy', 'post_deploy', 'pre_commit', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_user_ws
  ON agentsam_hook(user_id, workspace_id);

CREATE TABLE IF NOT EXISTS ai_routing_rules (
  id TEXT PRIMARY KEY,
  rule_name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  match_type TEXT NOT NULL,
  match_value TEXT NOT NULL,
  target_model_key TEXT NOT NULL,
  target_provider TEXT NOT NULL,
  reason TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (match_type IN ('intent', 'mode', 'keyword', 'tag', 'model'))
);

CREATE INDEX IF NOT EXISTS idx_ai_routing_rules_priority
  ON ai_routing_rules(priority DESC);
