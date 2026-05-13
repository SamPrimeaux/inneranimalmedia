-- Allow codebase indexer curated graph seeds (scripts/index-codebase-snapshot.mjs)
-- to use source_type = 'architecture' alongside existing enums.
ALTER TABLE public.knowledge_edges
  DROP CONSTRAINT IF EXISTS knowledge_edges_source_type_check;

ALTER TABLE public.knowledge_edges
  ADD CONSTRAINT knowledge_edges_source_type_check
  CHECK (
    source_type = ANY (
      ARRAY[
        'document'::text,
        'memory'::text,
        'decision'::text,
        'manual'::text,
        'architecture'::text
      ]
    )
  );
