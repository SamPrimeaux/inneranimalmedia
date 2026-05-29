-- Private managed operational memory (not public.agent_memory).
-- Apply via Supabase MCP / SQL editor on inneranimalmedia-business-supabase.

CREATE SCHEMA IF NOT EXISTS agentsam;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agentsam.agentsam_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  user_id text NOT NULL,

  memory_type text NOT NULL CHECK (memory_type IN (
    'fact', 'preference', 'project', 'skill', 'error', 'decision', 'policy', 'state'
  )),

  memory_key text NOT NULL,
  title text,
  content text NOT NULL,
  summary text,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  source text NOT NULL DEFAULT 'agent_sam',
  external_ref text,
  tags text[] NOT NULL DEFAULT '{}',

  confidence real NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  importance smallint NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),

  expires_at timestamptz,
  superseded_by uuid REFERENCES agentsam.agentsam_memory(id),
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,

  embedding vector(1536),
  embedded_at timestamptz,

  sync_key text NOT NULL,
  d1_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, user_id, memory_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_memory_sync_key
  ON agentsam.agentsam_memory (sync_key);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_ws_type_updated
  ON agentsam.agentsam_memory (workspace_id, memory_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_tenant_user_key
  ON agentsam.agentsam_memory (tenant_id, user_id, memory_key);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_active
  ON agentsam.agentsam_memory (workspace_id, updated_at DESC)
  WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_key_trgm
  ON agentsam.agentsam_memory USING gin (memory_key gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_content_trgm
  ON agentsam.agentsam_memory USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_summary_trgm
  ON agentsam.agentsam_memory USING gin (summary gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_tags
  ON agentsam.agentsam_memory USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_embedding_ann
  ON agentsam.agentsam_memory USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

ALTER TABLE agentsam.agentsam_memory ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE agentsam.agentsam_memory FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA agentsam FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA agentsam TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON agentsam.agentsam_memory TO service_role;

COMMENT ON TABLE agentsam.agentsam_memory IS
  'Private managed Agent Sam operational memory. Not public.agent_memory. Embedding optional.';

-- Seed error memory (idempotent)
INSERT INTO agentsam.agentsam_memory (
  tenant_id, workspace_id, user_id, memory_type, memory_key,
  title, content, summary, value_json, source, tags,
  confidence, importance, is_pinned, sync_key, d1_id
) VALUES (
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'au_871d920d1233cbd1',
  'error',
  'error:mcp_memory_save_401_reauth',
  'MCP memory save failed due to reauthentication required',
  'ChatGPT attempted to call inneranimalmedia-mcp-server agentsam_memory_save for a milestone memory, but the IAM MCP connector returned 401 reauthentication required. Re-auth MCP before external AI writes. Do not claim memory was saved when auth failed.',
  'MCP 401 on agentsam_memory_save — reauthenticate IAM MCP connector.',
  '{"repair":"reauth_mcp","tool":"agentsam_memory_save"}'::jsonb,
  'chatgpt_observed_failure',
  ARRAY['mcp','memory','auth','external-ai','repair']::text[],
  1.0,
  8,
  true,
  'tenant_sam_primeaux:au_871d920d1233cbd1:error:mcp_memory_save_401_reauth',
  'mem_error_mcp_memory_save_401_reauth'
)
ON CONFLICT (tenant_id, user_id, memory_key) DO UPDATE SET
  content = EXCLUDED.content,
  summary = EXCLUDED.summary,
  value_json = EXCLUDED.value_json,
  tags = EXCLUDED.tags,
  importance = EXCLUDED.importance,
  is_pinned = EXCLUDED.is_pinned,
  updated_at = now();
