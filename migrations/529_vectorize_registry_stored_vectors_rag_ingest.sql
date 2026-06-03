-- 529: stored_vectors after rag_ingest.mjs initial sync (2026-06-03)
-- Counts from Supabase embedded rows synced to CF Vectorize via scripts/rag_ingest.mjs

UPDATE vectorize_index_registry SET
  stored_vectors = 307,
  updated_at = datetime('now')
WHERE binding_name = 'AGENTSAM_VECTORIZE_COURSES';

UPDATE vectorize_index_registry SET
  stored_vectors = 192,
  updated_at = datetime('now')
WHERE binding_name = 'AGENTSAM_VECTORIZE_MEMORY';

UPDATE vectorize_index_registry SET
  stored_vectors = 593,
  updated_at = datetime('now')
WHERE binding_name = 'AGENTSAM_VECTORIZE_SCHEMA';

UPDATE vectorize_index_registry SET
  stored_vectors = 262,
  updated_at = datetime('now')
WHERE binding_name = 'AGENTSAM_VECTORIZE_CODE';
