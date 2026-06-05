-- MovieMode multimodal RAG lane — gemini-embedding-2 @1536.
-- Pairs with Cloudflare Vectorize AGENTSAM_VECTORIZE_MEDIA / agentsam-moviemode-gemini2-1536.
-- D1 media_assets.id is stored in asset_id (vectorize_id mirrors the same id).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agentsam.agentsam_media_gemini2_1536 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES agentsam.agentsam_workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  asset_id text NOT NULL,
  title text,
  content text NOT NULL,
  media_kind text NOT NULL DEFAULT 'unknown',
  bucket text,
  object_key text,
  content_type text,
  project_id text,
  content_hash text,
  token_count integer,
  embedding vector(1536),
  embedding_model text NOT NULL DEFAULT 'gemini-embedding-2',
  embedding_dims integer NOT NULL DEFAULT 1536,
  embedded_at timestamptz,
  vectorize_binding text NOT NULL DEFAULT 'AGENTSAM_VECTORIZE_MEDIA',
  vectorize_index text NOT NULL DEFAULT 'agentsam-moviemode-gemini2-1536',
  vectorize_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agentsam_media_gemini2_1536_embedding_dims_check CHECK (embedding_dims = 1536),
  CONSTRAINT agentsam_media_gemini2_1536_media_kind_check CHECK (
    media_kind = ANY (ARRAY['video'::text, 'image'::text, 'audio'::text, 'text'::text, 'binary'::text, 'unknown'::text])
  ),
  CONSTRAINT uq_agentsam_media_workspace_asset UNIQUE (workspace_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_media_workspace
  ON agentsam.agentsam_media_gemini2_1536 (workspace_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_media_kind
  ON agentsam.agentsam_media_gemini2_1536 (workspace_id, media_kind);

CREATE INDEX IF NOT EXISTS idx_agentsam_media_vectorize
  ON agentsam.agentsam_media_gemini2_1536 (workspace_id, vectorize_index, vectorize_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_media_embedding_hnsw
  ON agentsam.agentsam_media_gemini2_1536
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_media_metadata
  ON agentsam.agentsam_media_gemini2_1536 USING gin (metadata);

ALTER TABLE agentsam.agentsam_media_gemini2_1536 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON agentsam.agentsam_media_gemini2_1536;
CREATE POLICY service_role_all
  ON agentsam.agentsam_media_gemini2_1536
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS workspace_read ON agentsam.agentsam_media_gemini2_1536;
CREATE POLICY workspace_read
  ON agentsam.agentsam_media_gemini2_1536
  FOR SELECT
  TO authenticated
  USING (agentsam.agentsam_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS workspace_write ON agentsam.agentsam_media_gemini2_1536;
CREATE POLICY workspace_write
  ON agentsam.agentsam_media_gemini2_1536
  FOR INSERT
  TO authenticated
  WITH CHECK (agentsam.agentsam_has_workspace_access(workspace_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));

DROP POLICY IF EXISTS workspace_update ON agentsam.agentsam_media_gemini2_1536;
CREATE POLICY workspace_update
  ON agentsam.agentsam_media_gemini2_1536
  FOR UPDATE
  TO authenticated
  USING (agentsam.agentsam_has_workspace_access(workspace_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]))
  WITH CHECK (agentsam.agentsam_has_workspace_access(workspace_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));

DROP POLICY IF EXISTS workspace_delete ON agentsam.agentsam_media_gemini2_1536;
CREATE POLICY workspace_delete
  ON agentsam.agentsam_media_gemini2_1536
  FOR DELETE
  TO authenticated
  USING (agentsam.agentsam_has_workspace_access(workspace_id, ARRAY['owner'::text, 'admin'::text]));

GRANT SELECT, INSERT, UPDATE, DELETE ON agentsam.agentsam_media_gemini2_1536 TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON agentsam.agentsam_media_gemini2_1536 TO authenticated;

COMMENT ON TABLE agentsam.agentsam_media_gemini2_1536 IS
  'MovieMode multimodal media RAG @1536 — gemini-embedding-2; mirrored to CF Vectorize agentsam-moviemode-gemini2-1536.';
