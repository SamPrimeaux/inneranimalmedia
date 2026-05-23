-- Agent Sam semantic memory: align pgvector with Cloudflare Vectorize inneranimalmedia-vectors (1536, cosine).
-- Legacy documents / AutoRAG remain vector(1024) on VECTORIZE binding.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop old HNSW index (1024) if present
DROP INDEX IF EXISTS public.agent_memory_embedding_idx;
DROP INDEX IF EXISTS public.idx_agent_memory_embedding;

-- Widen column: existing 1024-d vectors cannot cast — clear then alter
UPDATE public.agent_memory SET embedding = NULL WHERE embedding IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_memory' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE public.agent_memory
      ALTER COLUMN embedding TYPE vector(1536)
      USING NULL;
  ELSE
    ALTER TABLE public.agent_memory ADD COLUMN embedding vector(1536);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_memory_embedding_1536
  ON public.agent_memory USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Semantic RPC (PostgREST: match_agent_memory)
CREATE OR REPLACE FUNCTION public.match_agent_memory(
  query_embedding vector(1536),
  p_session_id text DEFAULT NULL,
  p_agent_id text DEFAULT NULL,
  p_workspace_id text DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_threshold double precision DEFAULT 0.75
)
RETURNS TABLE (
  id uuid,
  session_id text,
  content text,
  role text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    am.id,
    am.session_id,
    am.content,
    am.role,
    am.metadata,
    (1 - (am.embedding <=> query_embedding))::double precision AS similarity
  FROM public.agent_memory am
  WHERE am.embedding IS NOT NULL
    AND (p_session_id IS NULL OR am.session_id = p_session_id)
    AND (p_agent_id IS NULL OR am.agent_id = p_agent_id)
    AND (p_workspace_id IS NULL OR am.workspace_id = p_workspace_id)
    AND (1 - (am.embedding <=> query_embedding)) >= p_threshold
  ORDER BY am.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));
$$;

-- Hybrid keyword + vector RPC (Hyperdrive: search_agent_memory)
CREATE OR REPLACE FUNCTION public.search_agent_memory(
  query_embedding vector(1536),
  query_text text,
  p_workspace_id text,
  match_limit integer DEFAULT 10,
  keyword_weight double precision DEFAULT 1.5,
  semantic_weight double precision DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  content text,
  hybrid_score double precision,
  embedding_distance double precision,
  trigram_similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      am.id,
      am.content,
      (am.embedding <=> query_embedding)::double precision AS embedding_distance,
      CASE
        WHEN COALESCE(query_text, '') = '' THEN 0::double precision
        ELSE similarity(am.content, query_text)
      END AS trigram_similarity
    FROM public.agent_memory am
    WHERE am.embedding IS NOT NULL
      AND (p_workspace_id IS NULL OR am.workspace_id = p_workspace_id)
  )
  SELECT
    b.id,
    b.content,
    (
      COALESCE(keyword_weight, 1.5) * COALESCE(b.trigram_similarity, 0)
      + COALESCE(semantic_weight, 0.5) * GREATEST(0, 1 - b.embedding_distance)
    )::double precision AS hybrid_score,
    b.embedding_distance,
    b.trigram_similarity
  FROM base b
  WHERE COALESCE(query_text, '') = '' OR b.trigram_similarity > 0.05 OR b.embedding_distance < 0.85
  ORDER BY hybrid_score DESC
  LIMIT GREATEST(1, LEAST(COALESCE(match_limit, 10), 50));
$$;

COMMENT ON COLUMN public.agent_memory.embedding IS
  '1536-d OpenAI text-embedding-3-large; mirrored to Cloudflare Vectorize inneranimalmedia-vectors (AGENTSAMVECTORIZE).';
