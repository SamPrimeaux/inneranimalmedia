-- 829: Seed tenant_vector_connections for IAM operator from vectorize_index_registry.
-- Maps each active AGENTSAM_VECTORIZE_* lane so Storage → Vectors UI has real rows.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/829_seed_tenant_vector_connections_iam.sql

INSERT OR IGNORE INTO tenant_vector_connections (
  id, tenant_id, user_id, workspace_id, provider, display_name,
  index_name, table_name, schema_name, binding_label, account_id,
  dimensions, metric, connection_status, config_json, is_active, created_at, updated_at
)
SELECT
  'tvc_' || lower(hex(randomblob(6))),
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'cloudflare_vectorize',
  COALESCE(r.display_name, r.index_name),
  r.index_name,
  CASE r.binding_name
    WHEN 'AGENTSAM_VECTORIZE_MEMORY' THEN 'agentsam_memory_oai3large_1536'
    WHEN 'AGENTSAM_VECTORIZE_DOCUMENTS' THEN 'agentsam_documents_oai3large_1536'
    WHEN 'AGENTSAM_VECTORIZE_CODE' THEN 'agentsam_code_oai3large_1536'
    WHEN 'AGENTSAM_VECTORIZE_SCHEMA' THEN 'agentsam_database_schema_oai3large_1536'
    WHEN 'AGENTSAM_VECTORIZE_COURSES' THEN 'agentsam_courses_oai3large_1536'
    WHEN 'AGENTSAM_VECTORIZE_MEDIA' THEN NULL
    ELSE NULL
  END,
  'agentsam',
  r.binding_name,
  'ede6590ac0d2fb7daf155b35653457b2',
  COALESCE(r.dimensions, 1536),
  COALESCE(r.metric, 'cosine'),
  'connected',
  json_object(
    'registry_id', r.id,
    'source', 'migration_829',
    'use_cases', COALESCE(r.use_cases, '[]')
  ),
  1,
  datetime('now'),
  datetime('now')
FROM vectorize_index_registry r
WHERE r.tenant_id = 'tenant_sam_primeaux'
  AND COALESCE(r.is_active, 1) = 1
  AND r.binding_name LIKE 'AGENTSAM_VECTORIZE_%'
  AND NOT EXISTS (
    SELECT 1 FROM tenant_vector_connections t
    WHERE t.tenant_id = 'tenant_sam_primeaux'
      AND t.user_id = 'au_871d920d1233cbd1'
      AND t.binding_label = r.binding_name
      AND COALESCE(t.is_active, 1) = 1
  );
