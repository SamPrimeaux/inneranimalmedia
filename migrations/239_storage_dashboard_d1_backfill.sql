PRAGMA table_info(project_storage);
PRAGMA table_info(r2_bucket_summary);
PRAGMA table_info(vectorize_index_registry);
PRAGMA table_info(vectorize_indexed_docs);
PRAGMA table_info(storage_policies);

INSERT OR IGNORE INTO project_storage (id, tenant_id, storage_type, storage_name, storage_id, region, status, metadata_json) VALUES
  ('ps_inneranimalmedia_assets','tenant_sam_primeaux','r2_bucket','inneranimalmedia-assets','inneranimalmedia-assets','auto','active','{"binding":"ASSETS","public":true}'),
  ('ps_autorag','tenant_sam_primeaux','r2_bucket','autorag','autorag','auto','active','{"binding":"AUTORAG_BUCKET","public":true,"url":"https://autorag.inneranimalmedia.com"}'),
  ('ps_agent_sam','tenant_sam_primeaux','r2_bucket','agent-sam','agent-sam','auto','active','{"binding":"DASHBOARD","public":false}'),
  ('ps_tools','tenant_sam_primeaux','r2_bucket','tools','tools','auto','active','{"binding":"TOOLS","public":true,"url":"https://tools.inneranimalmedia.com"}'),
  ('ps_iam_platform','tenant_sam_primeaux','r2_bucket','iam-platform','iam-platform','auto','active','{"binding":"IAM_PLATFORM","public":false}'),
  ('ps_iam_docs','tenant_sam_primeaux','r2_bucket','iam-docs','iam-docs','auto','active','{"binding":"DOCS","public":false}');

INSERT OR IGNORE INTO r2_bucket_summary 
  (bucket_name, object_count, total_bytes, total_mb, is_live_connected, priority, owner, project_ref, cleanup_status) VALUES
  ('inneranimalmedia-assets', 650, 45000000, 42.9, 1, 10, 'Sam', 'Inner Animal Media', 'unreviewed'),
  ('autorag', 95, 12000000, 11.4, 1, 20, 'Sam', 'AutoRAG / AI Search', 'reviewed'),
  ('agent-sam', 2100, 190000000, 181.2, 1, 30, 'Sam', 'Agent Sam Dashboard', 'unreviewed'),
  ('tools', 180, 8000000, 7.6, 1, 40, 'Sam', 'IAM Tools CDN', 'reviewed'),
  ('iam-platform', 82, 15000000, 14.3, 1, 50, 'Sam', 'IAM Platform', 'unreviewed'),
  ('iam-docs', 100, 11000000, 10.5, 1, 60, 'Sam', 'IAM Docs', 'unreviewed');

INSERT OR IGNORE INTO vectorize_index_registry
  (id, tenant_id, binding_name, index_name, display_name, source_type,
   source_r2_bucket, source_r2_prefix, dimensions, metric, is_preferred,
   is_active, stored_vectors, queries_30d, avg_latency_ms, description) VALUES
  ('vec_autorag_main','tenant_sam_primeaux','VECTORIZE',
   'ai-search-inneranimalmedia-autorag','InnerAnimalMedia AutoRAG',
   'autorag','autorag','docs/',768,'cosine',1,1,18403,342,41,
   'Primary semantic search index for IAM platform docs and knowledge base'),
  ('vec_tools_index','tenant_sam_primeaux','VECTORIZE_TOOLS',
   'iam-tools-index','IAM Tools Index',
   'r2_bucket','tools','/',768,'cosine',0,1,4200,88,55,
   'Tool documentation and usage pattern index');

INSERT OR IGNORE INTO vectorize_indexed_docs
  (id, tenant_id, index_id, source_r2_key, vector_id, chunk_index,
   content_preview, token_count, is_current) VALUES
  ('vid_001','tenant_sam_primeaux','vec_autorag_main','docs/worker-overview.md','vec_001',0,'Worker.js is the core monolith serving all IAM platform routes...',312,1),
  ('vid_002','tenant_sam_primeaux','vec_autorag_main','docs/d1-schema.md','vec_002',0,'D1 database schema reference for inneranimalmedia-business...',488,1),
  ('vid_003','tenant_sam_primeaux','vec_autorag_main','docs/mcp-tools.md','vec_003',0,'MCP tool registry contains 97 registered tools across 16 categories...',276,1),
  ('vid_004','tenant_sam_primeaux','vec_autorag_main','docs/agent-sam.md','vec_004',0,'Agent Sam is the primary AI devops assistant for IAM platform...',394,1),
  ('vid_005','tenant_sam_primeaux','vec_autorag_main','docs/deploy-pipeline.md','vec_005',0,'Deployment pipeline: deploy-sandbox.sh benchmark promote-to-prod...',301,1),
  ('vid_006','tenant_sam_primeaux','vec_tools_index','tools/mcp-reference.json','vec_101',0,'MCP tool invocation reference and parameter schemas...',215,1);

UPDATE agentsam_slash_commands
SET handler_type = 'tool_invoke',
    handler_ref = 'storage_rollup_bucket_summary'
WHERE slug = '/tablehealth';

UPDATE agentsam_slash_commands
SET handler_type = 'tool_invoke',
    handler_ref = 'storage_sync_project_storage_then_rollup'
WHERE slug = '/cleanup';
