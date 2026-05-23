-- ============================================================
-- Agent Sam Semantic Code Search — Supabase Schema
-- Vectorize index: inneranimalmedia-vectors (1536-dim, cosine)
-- Embedding model: text-embedding-3-large (OpenAI, 1536 dims)
-- Target quality: Cursor-grade semantic code retrieval
-- ============================================================
-- Run this in Supabase SQL Editor (service role required)
-- ============================================================

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. code_files
-- Source file registry — one row per tracked file
-- ============================================================
CREATE TABLE IF NOT EXISTS code_files (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id     TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  repo             TEXT NOT NULL DEFAULT 'inneranimalmedia',
  file_path        TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  extension        TEXT,
  language         TEXT,
  size_bytes       INTEGER,
  line_count       INTEGER,
  git_sha          TEXT,
  git_branch       TEXT NOT NULL DEFAULT 'main',
  r2_key           TEXT,
  last_indexed_at  TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(workspace_id, repo, file_path, git_branch)
);

CREATE INDEX IF NOT EXISTS idx_code_files_workspace  ON code_files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_code_files_repo_path  ON code_files(repo, file_path);
CREATE INDEX IF NOT EXISTS idx_code_files_language   ON code_files(language);
CREATE INDEX IF NOT EXISTS idx_code_files_active     ON code_files(is_active);

-- ============================================================
-- 2. code_chunks
-- Chunked code segments with 1536-dim embeddings
-- Each file → N chunks by function/class/block
-- ============================================================
CREATE TABLE IF NOT EXISTS code_chunks (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  file_id           TEXT NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  workspace_id      TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  repo              TEXT NOT NULL DEFAULT 'inneranimalmedia',

  -- chunk content
  content           TEXT NOT NULL,
  content_hash      TEXT NOT NULL,
  chunk_index       INTEGER NOT NULL DEFAULT 0,
  chunk_type        TEXT NOT NULL DEFAULT 'block'
                    CHECK(chunk_type IN (
                      'function','class','method','module',
                      'block','import','comment','schema','query','config'
                    )),
  symbol_name       TEXT,   -- function/class/method name if extractable
  start_line        INTEGER,
  end_line          INTEGER,
  token_count       INTEGER,
  language          TEXT,

  -- 1536-dim embedding (text-embedding-3-large)
  embedding         vector(1536),
  embedding_model   TEXT NOT NULL DEFAULT 'text-embedding-3-large',
  embedding_dims    INTEGER NOT NULL DEFAULT 1536,
  embedded_at       TIMESTAMPTZ,

  -- metadata for filtering
  git_sha           TEXT,
  git_branch        TEXT NOT NULL DEFAULT 'main',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(file_id, chunk_index, git_branch)
);

-- HNSW index for fast approximate nearest-neighbor (cosine)
-- m=16, ef_construction=64 — good balance for code search
CREATE INDEX IF NOT EXISTS idx_code_chunks_embedding
  ON code_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_code_chunks_file       ON code_chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_code_chunks_workspace  ON code_chunks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_code_chunks_type       ON code_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_code_chunks_language   ON code_chunks(language);
CREATE INDEX IF NOT EXISTS idx_code_chunks_symbol     ON code_chunks(symbol_name) WHERE symbol_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_code_chunks_active     ON code_chunks(is_active);

-- ============================================================
-- 3. code_search_log
-- Every search query logged — feeds quality eval
-- ============================================================
CREATE TABLE IF NOT EXISTS code_search_log (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id      TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  query_text        TEXT NOT NULL,
  query_embedding   vector(1536),
  top_k             INTEGER NOT NULL DEFAULT 10,
  filters_json      JSONB DEFAULT '{}',
  results_json      JSONB DEFAULT '[]',  -- [{chunk_id, score, file_path, symbol_name}]
  latency_ms        INTEGER,
  agent_run_id      TEXT,   -- FK to D1 agentsam_agent_run.id (cross-db reference)
  triggered_by      TEXT DEFAULT 'agent',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_log_workspace ON code_search_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_search_log_created   ON code_search_log(created_at DESC);

-- ============================================================
-- 4. code_context_sessions
-- Agent retrieval sessions — groups related searches into one context window
-- ============================================================
CREATE TABLE IF NOT EXISTS code_context_sessions (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id     TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  agent_run_id     TEXT,
  session_goal     TEXT,
  files_touched    JSONB DEFAULT '[]',
  chunks_retrieved INTEGER NOT NULL DEFAULT 0,
  total_tokens     INTEGER NOT NULL DEFAULT 0,
  cost_usd         REAL NOT NULL DEFAULT 0,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

-- ============================================================
-- 5. SEARCH FUNCTION — semantic_code_search()
-- Drop-in replacement for Cursor-style semantic lookup
-- ============================================================
CREATE OR REPLACE FUNCTION semantic_code_search(
  query_embedding   vector(1536),
  match_count       INT     DEFAULT 10,
  similarity_thresh FLOAT   DEFAULT 0.30,
  filter_language   TEXT    DEFAULT NULL,
  filter_chunk_type TEXT    DEFAULT NULL,
  filter_repo       TEXT    DEFAULT 'inneranimalmedia'
)
RETURNS TABLE (
  chunk_id      TEXT,
  file_path     TEXT,
  symbol_name   TEXT,
  chunk_type    TEXT,
  language      TEXT,
  content       TEXT,
  start_line    INTEGER,
  end_line      INTEGER,
  similarity    FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id           AS chunk_id,
    f.file_path,
    c.symbol_name,
    c.chunk_type,
    c.language,
    c.content,
    c.start_line,
    c.end_line,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM code_chunks c
  JOIN code_files f ON f.id = c.file_id
  WHERE c.is_active = true
    AND f.is_active = true
    AND (filter_language   IS NULL OR c.language    = filter_language)
    AND (filter_chunk_type IS NULL OR c.chunk_type  = filter_chunk_type)
    AND (filter_repo       IS NULL OR c.repo        = filter_repo)
    AND 1 - (c.embedding <=> query_embedding) > similarity_thresh
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================
-- 6. SEARCH FUNCTION — semantic_code_search_with_context()
-- Returns chunks + surrounding file context for richer answers
-- ============================================================
CREATE OR REPLACE FUNCTION semantic_code_search_with_context(
  query_embedding   vector(1536),
  match_count       INT   DEFAULT 5,
  similarity_thresh FLOAT DEFAULT 0.35,
  context_chunks    INT   DEFAULT 2  -- adjacent chunks to include
)
RETURNS TABLE (
  chunk_id      TEXT,
  file_path     TEXT,
  symbol_name   TEXT,
  chunk_type    TEXT,
  language      TEXT,
  content       TEXT,
  context       TEXT,   -- surrounding chunks concatenated
  start_line    INTEGER,
  end_line      INTEGER,
  similarity    FLOAT
)
LANGUAGE sql STABLE
AS $$
  WITH matches AS (
    SELECT
      c.id,
      c.file_id,
      c.chunk_index,
      c.symbol_name,
      c.chunk_type,
      c.language,
      c.content,
      c.start_line,
      c.end_line,
      f.file_path,
      1 - (c.embedding <=> query_embedding) AS similarity
    FROM code_chunks c
    JOIN code_files f ON f.id = c.file_id
    WHERE c.is_active = true AND f.is_active = true
      AND 1 - (c.embedding <=> query_embedding) > similarity_thresh
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count
  )
  SELECT
    m.id          AS chunk_id,
    m.file_path,
    m.symbol_name,
    m.chunk_type,
    m.language,
    m.content,
    (
      SELECT string_agg(ctx.content, E'\n---\n' ORDER BY ctx.chunk_index)
      FROM code_chunks ctx
      WHERE ctx.file_id = m.file_id
        AND ctx.chunk_index BETWEEN (m.chunk_index - context_chunks)
                                AND (m.chunk_index + context_chunks)
        AND ctx.id != m.id
        AND ctx.is_active = true
    ) AS context,
    m.start_line,
    m.end_line,
    m.similarity
  FROM matches m
  ORDER BY m.similarity DESC;
$$;

-- ============================================================
-- 7. HELPER — upsert_code_chunk()
-- Used by the embedding pipeline to insert/update chunks
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_code_chunk(
  p_file_id       TEXT,
  p_workspace_id  TEXT,
  p_repo          TEXT,
  p_content       TEXT,
  p_content_hash  TEXT,
  p_chunk_index   INTEGER,
  p_chunk_type    TEXT,
  p_symbol_name   TEXT,
  p_start_line    INTEGER,
  p_end_line      INTEGER,
  p_token_count   INTEGER,
  p_language      TEXT,
  p_embedding     vector(1536),
  p_git_sha       TEXT,
  p_git_branch    TEXT DEFAULT 'main'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE v_id TEXT;
BEGIN
  INSERT INTO code_chunks (
    file_id, workspace_id, repo, content, content_hash,
    chunk_index, chunk_type, symbol_name, start_line, end_line,
    token_count, language, embedding, embedded_at, git_sha, git_branch
  )
  VALUES (
    p_file_id, p_workspace_id, p_repo, p_content, p_content_hash,
    p_chunk_index, p_chunk_type, p_symbol_name, p_start_line, p_end_line,
    p_token_count, p_language, p_embedding, now(), p_git_sha, p_git_branch
  )
  ON CONFLICT (file_id, chunk_index, git_branch)
  DO UPDATE SET
    content       = EXCLUDED.content,
    content_hash  = EXCLUDED.content_hash,
    embedding     = EXCLUDED.embedding,
    embedded_at   = now(),
    updated_at    = now(),
    is_active     = true
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============================================================
-- 8. RLS policies (enable for production)
-- ============================================================
ALTER TABLE code_files           ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_chunks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_search_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_context_sessions ENABLE ROW LEVEL SECURITY;

-- Service role bypass (used by Agent Sam embedding pipeline)
CREATE POLICY "service_role_all" ON code_files
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON code_chunks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON code_search_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON code_context_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 9. Verify
-- ============================================================
SELECT
  'code_files'            AS table_name, COUNT(*) AS rows FROM code_files
UNION ALL SELECT
  'code_chunks',           COUNT(*) FROM code_chunks
UNION ALL SELECT
  'code_search_log',       COUNT(*) FROM code_search_log
UNION ALL SELECT
  'code_context_sessions', COUNT(*) FROM code_context_sessions;
