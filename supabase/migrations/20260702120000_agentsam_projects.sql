-- D1 projects → Supabase mirror for agent semantic search + unified project SSOT shape.
-- D1 `projects` remains control-plane write path; this table is updated on every project mutation.

CREATE SCHEMA IF NOT EXISTS agentsam;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agentsam.agentsam_projects (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  tenant_id       TEXT NOT NULL,
  parent_id       TEXT REFERENCES agentsam.agentsam_projects(id),

  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  project_type    TEXT NOT NULL,

  client_name     TEXT,
  client_contact  TEXT,

  repo_url        TEXT,
  live_url        TEXT,

  stack           JSONB NOT NULL DEFAULT '[]'::jsonb,
  integrations    JSONB NOT NULL DEFAULT '[]'::jsonb,
  infra           JSONB NOT NULL DEFAULT '{}'::jsonb,

  design_meta     JSONB NOT NULL DEFAULT '{}'::jsonb,

  priority        TEXT NOT NULL DEFAULT 'P2',
  phase           TEXT,
  is_pinned       BOOLEAN NOT NULL DEFAULT false,

  billing_type    TEXT,
  monthly_value   NUMERIC(10, 2),

  updated_by      TEXT,
  last_activity   TEXT,
  activity_log    JSONB NOT NULL DEFAULT '[]'::jsonb,
  embedding_dirty BOOLEAN NOT NULL DEFAULT true,

  started_at      TIMESTAMPTZ,
  target_date     TIMESTAMPTZ,
  shipped_at      TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  summary         TEXT,
  embedding       vector(1536),
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-large',
  embedded_at     TIMESTAMPTZ,

  UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_projects_workspace
  ON agentsam.agentsam_projects (workspace_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_projects_project_type
  ON agentsam.agentsam_projects (project_type);

CREATE INDEX IF NOT EXISTS idx_agentsam_projects_status
  ON agentsam.agentsam_projects (status);

CREATE INDEX IF NOT EXISTS idx_agentsam_projects_priority
  ON agentsam.agentsam_projects (priority);

CREATE INDEX IF NOT EXISTS idx_agentsam_projects_parent
  ON agentsam.agentsam_projects (parent_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_projects_pinned
  ON agentsam.agentsam_projects (is_pinned);

CREATE INDEX IF NOT EXISTS idx_agentsam_projects_embedding_dirty
  ON agentsam.agentsam_projects (embedding_dirty)
  WHERE embedding_dirty = true;

CREATE INDEX IF NOT EXISTS idx_agentsam_projects_tenant_workspace
  ON agentsam.agentsam_projects (tenant_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_projects_embedding_ivfflat
  ON agentsam.agentsam_projects
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50)
  WHERE embedding IS NOT NULL;

CREATE OR REPLACE VIEW agentsam.agentsam_projects_embedded AS
  SELECT *
  FROM agentsam.agentsam_projects
  WHERE embedding IS NOT NULL;

ALTER TABLE agentsam.agentsam_projects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE agentsam.agentsam_projects FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agentsam.agentsam_projects TO service_role;

COMMENT ON TABLE agentsam.agentsam_projects IS
  'Project mirror: D1 projects is canonical; upserted on every write via Hyperdrive from Worker.';

COMMENT ON VIEW agentsam.agentsam_projects_embedded IS
  'Projects with embeddings — cosine search lane.';
