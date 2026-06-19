-- 639: Pinned IAM platform context router — tells agents WHERE to look (not full platform body).
-- Pairs with ctx_inneranimalmedia (D1 compass) + platform/inneranimalmedia/* vector chunks.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/639_agentsam_memory_platform_context_router.sql

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_iam_platform_context_router_v1',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'decision',
  'iam_platform_context_router_v1',
  'START HERE for inneranimalmedia IAM platform work (2026-06-14). (1) D1 compass: agentsam_project_context.id=ctx_inneranimalmedia — constraints, blockers, deploy rules, key files. (2) Deep runtime: docs_knowledge_search "IAM platform snapshot" OR source_ref platform/inneranimalmedia/iam-platform-snapshot#* in agentsam_documents_oai3large_1536 + AGENTSAM_VECTORIZE_DOCUMENTS; git SSOT docs/platform/iam-platform-snapshot.md; re-ingest npm run run:ingest_platform_snapshot. (3) MCP/BYOK/tools: docs/platform/iam-runtime-architecture-2026-06.md. (4) PTY/tunnel/VPC/container: docs/platform/workers-vpc-moviemode.md; bindings PTY_SERVICE, MY_CONTAINER. (5) Repos: github.com/SamPrimeaux/inneranimalmedia deploy npm run deploy:full; github.com/SamPrimeaux/inneranimalmedia-mcp-server deploy cd repo && npm run deploy:full. (6) Client workers (companionscpas etc): separate workspace agentsam_project_context — never patch from IAM platform context. Do NOT use deleted ctx_iam_worker/ctx_iam_platform or full codebase reindex for orientation.',
  'IAM platform context router',
  'Router: ctx_inneranimalmedia → vector snapshot → architecture/PTY docs → client rows separate.',
  'migration_639_platform_router',
  '["inneranimalmedia","platform","router","ctx_inneranimalmedia","rag","mcp","pty"]',
  1.0,
  10,
  1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:iam_platform_context_router_v1',
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  title = excluded.title,
  summary = excluded.summary,
  workspace_id = excluded.workspace_id,
  memory_type = excluded.memory_type,
  source = excluded.source,
  tags = excluded.tags,
  confidence = excluded.confidence,
  importance = excluded.importance,
  is_pinned = excluded.is_pinned,
  sync_key = excluded.sync_key,
  updated_at = unixepoch();

UPDATE agentsam_project_context
SET
  notes = 'Canonical platform SSOT (638). Memory router: agentsam_memory.key=iam_platform_context_router_v1 (pinned). D1=this row. Deep=docs_knowledge_search platform/inneranimalmedia/*. Re-ingest: npm run run:ingest_platform_snapshot.',
  updated_at = unixepoch()
WHERE id = 'ctx_inneranimalmedia';
