-- Per-user per-workspace git branch preference (status bar + agent context).
-- Database: inneranimalmedia-business (D1)
-- Idempotent: safe if active_branch column already exists.

ALTER TABLE user_workspace_settings ADD COLUMN active_branch TEXT;
