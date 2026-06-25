-- 709: task_activity / task_comments / task_attachments → kanban_tasks.id
-- task_id references kanban_tasks(id), not legacy tasks(id).
-- Tables were empty at migration time; safe DROP + recreate.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/709_task_tables_kanban_fk.sql

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS task_activity;
DROP TABLE IF EXISTS task_comments;
DROP TABLE IF EXISTS task_attachments;

CREATE TABLE task_activity (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  changes_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES kanban_tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_task_activity_task ON task_activity(task_id, created_at);

CREATE TABLE task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES kanban_tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id, created_at);

CREATE TABLE task_attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES kanban_tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_task_attachments_task ON task_attachments(task_id);

PRAGMA foreign_keys = ON;
