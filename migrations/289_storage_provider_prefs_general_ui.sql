-- Per-provider storage configuration (one row per user + provider).
-- Legacy `user_storage_preferences` remains a single row keyed by (tenant_id, user_id).

CREATE TABLE IF NOT EXISTS user_storage_provider_preferences (
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  workspace_id TEXT,
  provider TEXT NOT NULL,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_storage_provider_prefs_user ON user_storage_provider_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_storage_provider_prefs_ws ON user_storage_provider_preferences(workspace_id);

-- General settings UI toggles (dashboard GeneralSection)
ALTER TABLE agentsam_user_policy ADD COLUMN sync_layouts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agentsam_user_policy ADD COLUMN show_status_bar INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agentsam_user_policy ADD COLUMN autohide_editor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agentsam_user_policy ADD COLUMN autoinject_code INTEGER NOT NULL DEFAULT 1;
