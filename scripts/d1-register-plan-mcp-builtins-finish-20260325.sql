-- Register MCP builtins finish plan in D1 (dashboard_assets + ai_knowledge_base).
-- After uploading the same file to:
--   iam-docs:  docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md
--   autorag:   plans/executed/TOMORROW-2026-03-25-mcp-builtins-finish.md
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-register-plan-mcp-builtins-finish-20260325.sql

INSERT OR REPLACE INTO dashboard_assets (id, workspace_id, kind, title, storage, r2_key, url, mime, size_bytes, tags_json, is_official, created_by, created_at, updated_at) VALUES (
  'da_doc_plan_mcp_builtins_finish_iam_docs_20260325',
  'ws_inneranimal',
  'file',
  'Plan: MCP builtins finish (2026-03-25) — iam-docs',
  'r2',
  'docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md',
  'https://docs.inneranimalmedia.com/docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md',
  'text/markdown',
  5139,
  '{"plan_id":"plan_iam_dashboard_v1","doc_role":"iam_docs_markdown","r2_bucket":"iam-docs","autorag_mirror_key":"plans/executed/TOMORROW-2026-03-25-mcp-builtins-finish.md","kb_id":"kb-plan-mcp-builtins-finish-20260325","roadmap_prefix":"step_mcp_finish_"}',
  1,
  'sam_primeaux',
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO dashboard_assets (id, workspace_id, kind, title, storage, r2_key, url, mime, size_bytes, tags_json, is_official, created_by, created_at, updated_at) VALUES (
  'da_doc_plan_mcp_builtins_finish_autorag_20260325',
  'ws_inneranimal',
  'file',
  'Plan: MCP builtins finish (2026-03-25) — autorag bucket',
  'r2',
  'plans/executed/TOMORROW-2026-03-25-mcp-builtins-finish.md',
  NULL,
  'text/markdown',
  5139,
  '{"plan_id":"plan_iam_dashboard_v1","doc_role":"autorag_corpus","r2_bucket":"autorag","iam_docs_mirror_key":"docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md","public_read_url":"https://docs.inneranimalmedia.com/docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md","kb_id":"kb-plan-mcp-builtins-finish-20260325","roadmap_prefix":"step_mcp_finish_"}',
  1,
  'sam_primeaux',
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO ai_knowledge_base (id, tenant_id, title, content, content_type, category, source_url, author, metadata_json, chunk_count, token_count, is_indexed, is_active, created_at, updated_at) VALUES (
  'kb-plan-mcp-builtins-finish-20260325',
  'tenant_sam_primeaux',
  'MCP builtins finish plan (2026-03-25)',
  'Runbook: pre-flight D1 cdt_% and remote MCP; upload dashboard/mcp.html to R2; smoke matrix (GITHUB_TOKEN, CLOUDFLARE_IMAGES_*, gdrive user_oauth_tokens + oauth_token, resend_*, cdt_*); Anthropic agent + MCP workflows; close out roadmap_steps step_mcp_finish_*. Rollback git 98ed8d8. Full markdown with YAML frontmatter: iam-docs docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md and autorag plans/executed/TOMORROW-2026-03-25-mcp-builtins-finish.md. POST /api/agentsam/autorag/sync after autorag changes.',
  'document',
  'plans',
  'https://docs.inneranimalmedia.com/docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md',
  'sam_primeaux',
  '{"r2_iam_docs_key":"docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md","r2_autorag_bucket":"autorag","r2_autorag_key":"plans/executed/TOMORROW-2026-03-25-mcp-builtins-finish.md","plan_id":"plan_iam_dashboard_v1","roadmap_step_ids":["step_mcp_finish_preflight_20260325","step_mcp_finish_r2_mcp_html_20260325","step_mcp_finish_builtin_matrix_20260325","step_mcp_finish_agent_workflows_20260325","step_mcp_finish_closeout_20260325"],"dashboard_asset_ids":["da_doc_plan_mcp_builtins_finish_iam_docs_20260325","da_doc_plan_mcp_builtins_finish_autorag_20260325"],"repo_path":"docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md"}',
  0,
  0,
  0,
  1,
  unixepoch(),
  unixepoch()
);
