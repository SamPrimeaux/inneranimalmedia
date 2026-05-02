-- infrastructure_documentation: D1 canonical keys + KB sync (repo docs/memory/D1_CANONICAL_AGENT_KEYS.md)
-- Re-run after changing the MD; upload same path to R2 iam-platform when you sync memory to bucket.
INSERT OR REPLACE INTO infrastructure_documentation (
  id,
  tenant_id,
  bucket_name,
  r2_key,
  title,
  file_type,
  category,
  size_bytes,
  content_preview,
  r2_object_id,
  tags,
  last_synced_at,
  created_at,
  updated_at
) VALUES (
  'infra-doc-d1-canonical-keys-20260322',
  'tenant_sam_primeaux',
  'iam-platform',
  'memory/D1_CANONICAL_AGENT_KEYS.md',
  'D1 canonical agent_memory_index, dashboard_versions, KB and session sync (IAM)',
  'md',
  'd1-operations',
  3145,
  'Repo: docs/memory/D1_CANONICAL_AGENT_KEYS.md. Registry id infra-doc-d1-canonical-keys-20260322 (iam-platform memory/D1_CANONICAL_AGENT_KEYS.md). tenant_id=system for agent_memory_index; dashboard_versions; d1-sync-session-*.sql; roadmap_steps; KB kb-iam-d1-canonical-keys-20260322; clients=client_id source; d1-kb-insert-canonical-knowledge.sql + vectorize-kb.',
  NULL,
  '["d1","agent_memory_index","dashboard_versions","kb","vectorize","session-sync","tenant_sam_primeaux","iam-platform","memory"]',
  NULL,
  unixepoch(),
  unixepoch()
);
