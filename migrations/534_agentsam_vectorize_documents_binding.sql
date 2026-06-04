-- 534: Bind AGENTSAM_VECTORIZE_DOCUMENTS — docs lane uses documents index (not courses).
-- Doc: docs/platform/bindings-vectorize-api-map-2026-06.md
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/534_agentsam_vectorize_documents_binding.sql

INSERT OR IGNORE INTO vectorize_index_registry (
  id, binding_name, index_name, display_name, source_type,
  dimensions, metric, is_preferred, is_active,
  description, use_cases, created_at, updated_at
) VALUES (
  'vidx_agentsam_documents',
  'AGENTSAM_VECTORIZE_DOCUMENTS',
  'agentsam-documents-oai3large-1536',
  'Agent Sam documents (1536)',
  'manual',
  1536,
  'cosine',
  0,
  1,
  'Document/knowledge Vectorize lane; pairs with agentsam_documents_oai3large_1536.',
  '["documents","docs_knowledge_search","learn"]',
  datetime('now'),
  datetime('now')
);

UPDATE vectorize_index_registry SET
  binding_name = 'AGENTSAM_VECTORIZE_DOCUMENTS',
  index_name = 'agentsam-documents-oai3large-1536',
  display_name = 'Agent Sam documents (1536)',
  dimensions = 1536,
  metric = 'cosine',
  is_active = 1,
  description = 'Document/knowledge Vectorize lane; pairs with agentsam_documents_oai3large_1536.',
  use_cases = '["documents","docs_knowledge_search","learn"]',
  updated_at = datetime('now')
WHERE id = 'vidx_agentsam_documents';

UPDATE vectorize_index_registry SET
  display_name = 'Agent Sam courses (1536)',
  description = 'Course-only Vectorize lane (Learn/course catalog). Docs lane uses AGENTSAM_VECTORIZE_DOCUMENTS.',
  use_cases = '["courses","learn_catalog"]',
  updated_at = datetime('now')
WHERE binding_name = 'AGENTSAM_VECTORIZE_COURSES';

UPDATE agentsam_tools
SET
  handler_config = json_set(
    COALESCE(handler_config, '{}'),
    '$.binding',
    'AGENTSAM_VECTORIZE_DOCUMENTS'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'docs_knowledge_search'
   OR tool_name = 'docs_knowledge_search';

UPDATE agentsam_rules_document
SET
  body_markdown = replace(
    replace(body_markdown, 'AGENTSAM_VECTORIZE_COURSES | agentsam-courses-oai3large-1536 | agentsam_documents_oai3large_1536', 'AGENTSAM_VECTORIZE_DOCUMENTS | agentsam-documents-oai3large-1536 | agentsam_documents_oai3large_1536'),
    '**Docs lane quirk:** documents table + courses index until AGENTSAM_VECTORIZE_DOCUMENTS ships.',
    '**Courses lane:** AGENTSAM_VECTORIZE_COURSES (agentsam-courses-oai3large-1536) is course-catalog only; docs use AGENTSAM_VECTORIZE_DOCUMENTS.'
  ),
  updated_at_epoch = unixepoch()
WHERE id = 'rule_iam_bindings_vectorize_api_map';

UPDATE vectorize_index_registry SET
  stored_vectors = 307,
  updated_at = datetime('now')
WHERE binding_name = 'AGENTSAM_VECTORIZE_DOCUMENTS';
