-- semantic_search_log: tenant-scoped read for authenticated; Worker/Hyperdrive writes via DB role.
-- knowledge_edges: same pattern; backfill null tenants before NOT NULL (single-tenant ops scope).

-- ── semantic_search_log: backfill then RLS ───────────────────────────────────
UPDATE public.semantic_search_log
SET tenant_id = 'tenant_sam_primeaux'
WHERE tenant_id IS NULL OR btrim(tenant_id) = '';

ALTER TABLE public.semantic_search_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.semantic_search_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.semantic_search_log FROM authenticated;
GRANT SELECT ON public.semantic_search_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.semantic_search_log TO service_role;

DROP POLICY IF EXISTS "tenant can read semantic search logs" ON public.semantic_search_log;
CREATE POLICY "tenant can read semantic search logs"
  ON public.semantic_search_log
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'tenant_id',
      auth.jwt() ->> 'tenant_id'
    )
  );

ALTER TABLE public.semantic_search_log
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.semantic_search_log
  DROP CONSTRAINT IF EXISTS semantic_search_log_tenant_nonempty;

ALTER TABLE public.semantic_search_log
  ADD CONSTRAINT semantic_search_log_tenant_nonempty
  CHECK (length(btrim(tenant_id)) > 0);

-- ── knowledge_edges: backfill then RLS ─────────────────────────────────────
UPDATE public.knowledge_edges
SET tenant_id = 'tenant_sam_primeaux'
WHERE tenant_id IS NULL OR btrim(tenant_id) = '';

ALTER TABLE public.knowledge_edges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.knowledge_edges
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.knowledge_edges
  DROP CONSTRAINT IF EXISTS knowledge_edges_tenant_nonempty;

ALTER TABLE public.knowledge_edges
  ADD CONSTRAINT knowledge_edges_tenant_nonempty
  CHECK (length(btrim(tenant_id)) > 0);

REVOKE ALL ON public.knowledge_edges FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_edges FROM authenticated;
GRANT SELECT ON public.knowledge_edges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_edges TO service_role;

DROP POLICY IF EXISTS "tenant can read knowledge edges" ON public.knowledge_edges;
CREATE POLICY "tenant can read knowledge edges"
  ON public.knowledge_edges
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'tenant_id',
      auth.jwt() ->> 'tenant_id'
    )
  );

-- ── knowledge_edges.embedding → vector(1024) + HNSW (only if all non-null vectors are 1024-dim)
DO $$
DECLARE
  bad bigint;
BEGIN
  IF to_regclass('public.knowledge_edges') IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO bad
  FROM public.knowledge_edges
  WHERE embedding IS NOT NULL
    AND vector_dims(embedding) IS DISTINCT FROM 1024;

  IF bad > 0 THEN
    RAISE NOTICE 'knowledge_edges: skipped embedding migration — % rows with non-1024 embeddings', bad;
    RETURN;
  END IF;

  DROP INDEX IF EXISTS idx_ke_embedding;

  ALTER TABLE public.knowledge_edges
    ADD COLUMN IF NOT EXISTS embedding_1024 public.vector(1024);

  UPDATE public.knowledge_edges
  SET embedding_1024 = embedding::public.vector(1024)
  WHERE embedding IS NOT NULL
    AND vector_dims(embedding) = 1024;

  ALTER TABLE public.knowledge_edges RENAME COLUMN embedding TO embedding_old;
  ALTER TABLE public.knowledge_edges RENAME COLUMN embedding_1024 TO embedding;
  ALTER TABLE public.knowledge_edges DROP COLUMN IF EXISTS embedding_old;

  CREATE INDEX IF NOT EXISTS idx_ke_embedding
    ON public.knowledge_edges
    USING hnsw (embedding vector_cosine_ops);
END $$;
