-- Idempotent upserts from Worker/scripts (PostgREST on_conflict=entity_a,relation,entity_b,tenant_id).
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_edges_entity_relation_b_tenant_uq
  ON public.knowledge_edges (entity_a, relation, entity_b, tenant_id);
