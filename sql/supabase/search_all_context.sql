-- -----------------------------------------------------------------------------
-- public.search_all_context — unified RAG over `public.documents` (project-scoped)
--
-- Worker calls this via Hyperdrive (src/api/rag.js) with:
--   search_all_context($1::vector(dim), threshold, limit, agent_project_id)
-- where `agent_project_id` matches `documents.project_id` (same value as RAG_AGENT_ID /
-- RAG_DOCUMENTS_PROJECT_ID in production).
--
-- Run in the Supabase SQL editor (or apply through your migration process).
-- Requires: pgvector, table public.documents with columns id, source, title, content,
-- embedding (vector), project_id (text).
--
-- After applying, verify overloads with:
--   SELECT p.oid, pg_get_function_arguments(p.oid) AS args
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'search_all_context'
--   ORDER BY p.oid;
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_all_context(
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
  agent_project_id text
)
RETURNS TABLE (
  id uuid,
  source text,
  title text,
  content text,
  similarity double precision
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT
    d.id,
    d.source,
    d.title,
    COALESCE(d.content, '')::text AS content,
    (1.0::double precision - (d.embedding <=> query_embedding)::double precision) AS similarity
  FROM public.documents d
  WHERE d.project_id = agent_project_id
    AND d.embedding IS NOT NULL
    AND (1.0 - (d.embedding <=> query_embedding)) >= match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT GREATEST(COALESCE(match_count, 1), 1);
$$;
