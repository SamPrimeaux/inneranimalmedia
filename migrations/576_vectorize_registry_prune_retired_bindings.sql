-- 576: Remove vectorize_index_registry rows for bindings no longer in wrangler.production.toml.
-- Live bindings (2026-06): six AGENTSAM_VECTORIZE_* lanes only.
-- Prunes retired VECTORIZE, VECTORIZE_INDEX, VECTORIZE_DOCS, AGENTSAMVECTORIZE, and mistaken TOOLS row.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/576_vectorize_registry_prune_retired_bindings.sql

DELETE FROM vectorize_indexed_docs
WHERE index_id IN (
  SELECT id FROM vectorize_index_registry
  WHERE binding_name NOT IN (
    'AGENTSAM_VECTORIZE_DOCUMENTS',
    'AGENTSAM_VECTORIZE_COURSES',
    'AGENTSAM_VECTORIZE_CODE',
    'AGENTSAM_VECTORIZE_SCHEMA',
    'AGENTSAM_VECTORIZE_MEMORY',
    'AGENTSAM_VECTORIZE_MEDIA'
  )
);

DELETE FROM vectorize_index_registry
WHERE binding_name NOT IN (
  'AGENTSAM_VECTORIZE_DOCUMENTS',
  'AGENTSAM_VECTORIZE_COURSES',
  'AGENTSAM_VECTORIZE_CODE',
  'AGENTSAM_VECTORIZE_SCHEMA',
  'AGENTSAM_VECTORIZE_MEMORY',
  'AGENTSAM_VECTORIZE_MEDIA'
);
