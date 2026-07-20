-- Additive identity + projection_key columns for memory chunk lane.
-- Chunk table owns semantic vectors. Managed agentsam.agentsam_memory keeps relational projection only.
-- Do not rewrite existing row content. Do not drop legacy UUID columns yet.

ALTER TABLE agentsam.agentsam_memory_oai3large_1536
  ADD COLUMN IF NOT EXISTS projection_key text,
  ADD COLUMN IF NOT EXISTS memory_id text,
  ADD COLUMN IF NOT EXISTS revision integer,
  ADD COLUMN IF NOT EXISTS chunk_index integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chunk_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS tenant_key text,
  ADD COLUMN IF NOT EXISTS user_key text,
  ADD COLUMN IF NOT EXISTS workspace_key text,
  ADD COLUMN IF NOT EXISTS memory_type text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS sensitivity text,
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedding_dimensions integer,
  ADD COLUMN IF NOT EXISTS embedding_version text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agentsam_memory_oai3large_projection_key
  ON agentsam.agentsam_memory_oai3large_1536 (projection_key)
  WHERE projection_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_oai3large_memory_rev
  ON agentsam.agentsam_memory_oai3large_1536 (memory_id, revision);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_oai3large_workspace_key
  ON agentsam.agentsam_memory_oai3large_1536 (workspace_key);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_oai3large_tenant_user
  ON agentsam.agentsam_memory_oai3large_1536 (tenant_key, user_key);

-- Managed relational projection: stop treating embedding column as SSOT for semantics.
-- Keep column for now (nullable) but new writers leave it NULL; chunk table owns vectors.
ALTER TABLE agentsam.agentsam_memory
  ADD COLUMN IF NOT EXISTS memory_id text,
  ADD COLUMN IF NOT EXISTS revision integer,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS sensitivity text,
  ADD COLUMN IF NOT EXISTS projection_key text,
  ADD COLUMN IF NOT EXISTS scope_type text,
  ADD COLUMN IF NOT EXISTS scope_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agentsam_memory_projection_key
  ON agentsam.agentsam_memory (projection_key)
  WHERE projection_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_memory_id_rev
  ON agentsam.agentsam_memory (memory_id, revision);

COMMENT ON COLUMN agentsam.agentsam_memory.embedding IS
  'DEPRECATED for semantic SSOT — use agentsam_memory_oai3large_1536. New writers leave NULL.';
COMMENT ON COLUMN agentsam.agentsam_memory_oai3large_1536.projection_key IS
  'Deterministic key memory:{memory_id}:revision:{n}:chunk:{i}:embed:{version}';
COMMENT ON COLUMN agentsam.agentsam_memory_oai3large_1536.workspace_key IS
  'Canonical IAM workspace string id (e.g. ws_inneranimalmedia), not UUID-only.';
COMMENT ON COLUMN agentsam.agentsam_memory_oai3large_1536.user_key IS
  'Canonical IAM user string id (e.g. au_*), not UUID-only.';

-- Allow null legacy UUID when workspace_key text identity is present.
ALTER TABLE agentsam.agentsam_memory_oai3large_1536 ALTER COLUMN workspace_id DROP NOT NULL;
