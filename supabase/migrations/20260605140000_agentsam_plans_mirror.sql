-- D1 → Supabase embed mirror for plan semantic search (Hyperdrive upsert from Worker).
-- D1 remains source of truth; this table stores summary + embedding + r2_url only.

CREATE SCHEMA IF NOT EXISTS agentsam;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agentsam.agentsam_plans (
  id                  text PRIMARY KEY,
  plan_date           text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
  title               text NOT NULL,
  status              text NOT NULL DEFAULT 'active',
  tenant_id           text,
  workspace_id        text,
  summary             text,
  r2_url              text,
  embedding           vector(1536),
  embedding_model     text,
  embedding_dims      integer,
  embedded_at         timestamptz,
  morning_brief       text,
  session_notes       text,
  eod_summary         text,
  available_providers jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocked_providers   jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_model       text,
  carry_over_from     text,
  carry_over_count    integer,
  tasks_total         integer NOT NULL DEFAULT 0,
  tasks_done          integer NOT NULL DEFAULT 0,
  tasks_blocked       integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agentsam_plans_tenant_workspace
  ON agentsam.agentsam_plans (tenant_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_plans_embedding_ivfflat
  ON agentsam.agentsam_plans
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE OR REPLACE VIEW agentsam.agentsam_plans_embedded AS
  SELECT *
  FROM agentsam.agentsam_plans
  WHERE embedding IS NOT NULL;

ALTER TABLE agentsam.agentsam_plans ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE agentsam.agentsam_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agentsam.agentsam_plans TO service_role;

COMMENT ON TABLE agentsam.agentsam_plans IS
  'Plan embed mirror: summary + vector(1536) + r2_url for semantic search; D1 is canonical.';

COMMENT ON VIEW agentsam.agentsam_plans_embedded IS
  'Rows with embeddings only — use for RAG / cosine search queries.';
