PRAGMA foreign_keys = OFF;

-- ─── kanban_boards ────────────────────────────────────────────────────────────
CREATE TABLE kanban_boards_new (
  id           TEXT    PRIMARY KEY,
  tenant_id    TEXT    NOT NULL,
  workspace_id TEXT,
  project_id   TEXT,
  owner_id     TEXT,
  name         TEXT    NOT NULL,
  description  TEXT,
  board_type   TEXT    DEFAULT 'project',
  config_json  TEXT    DEFAULT '{}',
  is_active    INTEGER DEFAULT 1,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO kanban_boards_new SELECT
  id, tenant_id, NULL, project_id, owner_id,
  name, description, board_type, config_json,
  is_active, created_at, updated_at
FROM kanban_boards;

DROP TABLE kanban_boards;
ALTER TABLE kanban_boards_new RENAME TO kanban_boards;

CREATE INDEX idx_kanban_boards_tenant    ON kanban_boards(tenant_id);
CREATE INDEX idx_kanban_boards_workspace ON kanban_boards(workspace_id);
CREATE INDEX idx_kanban_boards_owner     ON kanban_boards(owner_id);
CREATE INDEX idx_kanban_boards_project   ON kanban_boards(project_id);

-- ─── kanban_columns ───────────────────────────────────────────────────────────
CREATE TABLE kanban_columns_new (
  id          TEXT    PRIMARY KEY,
  tenant_id   TEXT    NOT NULL,
  board_id    TEXT    NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  color       TEXT,
  config_json TEXT    DEFAULT '{}',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO kanban_columns_new SELECT
  id, tenant_id, board_id, name,
  position, color, config_json, created_at, updated_at
FROM kanban_columns;

DROP TABLE kanban_columns;
ALTER TABLE kanban_columns_new RENAME TO kanban_columns;

CREATE INDEX idx_kanban_columns_board  ON kanban_columns(board_id);
CREATE INDEX idx_kanban_columns_tenant ON kanban_columns(tenant_id);

-- ─── kanban_tasks ─────────────────────────────────────────────────────────────
CREATE TABLE kanban_tasks_new (
  id           TEXT    PRIMARY KEY,
  tenant_id    TEXT    NOT NULL,
  board_id     TEXT    NOT NULL REFERENCES kanban_boards(id)   ON DELETE CASCADE,
  column_id    TEXT    REFERENCES kanban_columns(id)            ON DELETE SET NULL,
  -- Agent link (bidirectional with agentsam_todo.kanban_task_id)
  todo_id      TEXT    REFERENCES agentsam_todo(id)             ON DELETE SET NULL,
  title        TEXT    NOT NULL,
  description  TEXT,
  category     TEXT    CHECK(category IN ('html','worker','content','client',
                                          'system','api','database','design')),
  priority     TEXT    DEFAULT 'medium'
                       CHECK(priority IN ('low','medium','high','urgent')),
  assignee_id  TEXT,
  client_name  TEXT,
  project_url  TEXT,
  bindings     TEXT,
  tags         TEXT,
  meta_json    TEXT    DEFAULT '{}',
  position     INTEGER NOT NULL DEFAULT 0,
  due_date     INTEGER,
  completed_at INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO kanban_tasks_new SELECT
  id, tenant_id, board_id, column_id, NULL,
  title, description, category, priority,
  assignee_id, client_name, project_url, bindings,
  tags, meta_json, position, due_date,
  completed_at, created_at, updated_at
FROM kanban_tasks;

DROP TABLE kanban_tasks;
ALTER TABLE kanban_tasks_new RENAME TO kanban_tasks;

CREATE INDEX idx_kanban_tasks_tenant   ON kanban_tasks(tenant_id);
CREATE INDEX idx_kanban_tasks_board    ON kanban_tasks(board_id);
CREATE INDEX idx_kanban_tasks_column   ON kanban_tasks(column_id);
CREATE INDEX idx_kanban_tasks_todo     ON kanban_tasks(todo_id);
CREATE INDEX idx_kanban_tasks_assignee ON kanban_tasks(assignee_id);
CREATE INDEX idx_kanban_tasks_due      ON kanban_tasks(due_date);
CREATE INDEX idx_kanban_tasks_priority ON kanban_tasks(priority);

PRAGMA foreign_keys = ON;
