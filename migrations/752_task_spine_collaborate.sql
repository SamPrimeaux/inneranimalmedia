-- 752: Task spine for collaborate — agentsam_todo human/agent lanes + task_* for todos + burn tracking.
-- Tables task_activity/comments/attachments were empty; safe recreate.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/752_task_spine_collaborate.sql

PRAGMA foreign_keys = OFF;

-- agentsam_todo: human-facing fields vs agent execution lane
ALTER TABLE agentsam_todo ADD COLUMN client_id TEXT;
ALTER TABLE agentsam_todo ADD COLUMN agent_instructions TEXT;

CREATE INDEX IF NOT EXISTS idx_todo_client_status ON agentsam_todo(client_id, status);
CREATE INDEX IF NOT EXISTS idx_todo_project_client ON agentsam_todo(project_id, client_id);

UPDATE agentsam_todo
SET client_id = (
  SELECT p.client_id FROM projects p WHERE p.id = agentsam_todo.project_id LIMIT 1
)
WHERE project_id IS NOT NULL
  AND (client_id IS NULL OR TRIM(client_id) = '');

UPDATE agentsam_todo
SET client_id = 'client_companions_cpas'
WHERE project_id = 'proj_companions_cpas_web'
  AND (client_id IS NULL OR TRIM(client_id) = '');

-- Backfill agent_instructions from notes where tagged as agent work
UPDATE agentsam_todo
SET agent_instructions = notes,
    notes = NULL
WHERE notes IS NOT NULL
  AND tags LIKE '%"agent-instructions"%'
  AND (agent_instructions IS NULL OR TRIM(agent_instructions) = '');

DROP TABLE IF EXISTS task_activity;
DROP TABLE IF EXISTS task_comments;
DROP TABLE IF EXISTS task_attachments;

CREATE TABLE task_activity (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_source TEXT NOT NULL DEFAULT 'agentsam_todo'
    CHECK (task_source IN ('agentsam_todo', 'kanban_tasks')),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  changes_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_task_activity_task ON task_activity(task_source, task_id, created_at DESC);
CREATE INDEX idx_task_activity_tenant ON task_activity(tenant_id, created_at DESC);

CREATE TABLE task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_source TEXT NOT NULL DEFAULT 'agentsam_todo'
    CHECK (task_source IN ('agentsam_todo', 'kanban_tasks')),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_task_comments_task ON task_comments(task_source, task_id, created_at DESC);

CREATE TABLE task_attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_source TEXT NOT NULL DEFAULT 'agentsam_todo'
    CHECK (task_source IN ('agentsam_todo', 'kanban_tasks')),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  file_name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_task_attachments_task ON task_attachments(task_source, task_id);

-- time_projects: link to projects.id + burn tracking (not billing-focused)
ALTER TABLE time_projects ADD COLUMN projects_id TEXT;
ALTER TABLE time_projects ADD COLUMN track_burn INTEGER NOT NULL DEFAULT 1;
ALTER TABLE time_projects ADD COLUMN client_id TEXT;

CREATE INDEX IF NOT EXISTS idx_time_projects_projects_id ON time_projects(projects_id);
CREATE INDEX IF NOT EXISTS idx_time_projects_client ON time_projects(client_id);

INSERT OR IGNORE INTO time_projects (
  project_key, label, tenant_id, workspace_id, client_name, client_id,
  billing_type, description, projects_id, track_burn, is_active, created_at
) VALUES (
  'companionscpas',
  'Companions of Caddo',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'Companions of Caddo',
  'client_companions_cpas',
  'client_retainer',
  'Public site companionsofcaddo.org + client worker. Track time/cost burn per project.',
  'proj_companions_cpas_web',
  1,
  1,
  datetime('now')
);

UPDATE time_projects
SET projects_id = 'proj_companions_cpas_web',
    client_id = 'client_companions_cpas',
    client_name = 'Companions of Caddo',
    track_burn = 1,
    label = 'Companions of Caddo'
WHERE project_key = 'companionscpas';

-- task_velocity: optional per-project daily rollup
ALTER TABLE task_velocity ADD COLUMN project_id TEXT;
ALTER TABLE task_velocity ADD COLUMN client_id TEXT;
ALTER TABLE task_velocity ADD COLUMN time_minutes INTEGER DEFAULT 0;
ALTER TABLE task_velocity ADD COLUMN cost_usd REAL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_task_velocity_project_date ON task_velocity(project_id, date);

-- project_costs: ensure TEXT project_id index for burn queries (column already stores TEXT ids in prod)
CREATE INDEX IF NOT EXISTS idx_project_costs_project ON project_costs(project_id, cost_type, created_at DESC);

PRAGMA foreign_keys = ON;
