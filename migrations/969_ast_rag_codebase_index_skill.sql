-- 969: Register AST-RAG codebase index skill (Phase 1 parse + Phase 2 embed/link).
-- Upload:
--   ./scripts/upload-iam-skills-autorag.sh
--   ./scripts/with-cloudflare-env.sh npx wrangler r2 object put \
--     inneranimalmedia-autorag/skills/ast-rag-codebase-index/reference.md \
--     --file=skills/ast-rag-codebase-index/reference.md \
--     --content-type="text/markdown; charset=utf-8" --remote -c wrangler.production.toml
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/969_ast_rag_codebase_index_skill.sql

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_ast_rag_codebase_index',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'AST-RAG codebase index',
  'Index and refresh AST-RAG: Phase 1 D1 parse, Phase 2 Supabase symbol embed + chunk node_id link, smoke ANN, multi-workspace customer isolation, drift checks. Use for agentsam_codebase_retrieve freshness.',
  '',
  'skills/ast-rag-codebase-index/SKILL.md',
  'workspace',
  'ast-rag-index',
  '["scripts/ast_rag_phase1_dual_repo_walk.py","scripts/ast_rag_phase2_embed_symbols.py","src/core/codebase-ast-retrieve.js","migrations/952_codebase_ast_nodes_and_dep_edges.sql","migrations/954_agentsam_codebase_retrieve_tool.sql"]',
  0,
  '["rag","codebase","embed","index","ast"]',
  '["agent_general","plan","research","debug"]',
  NULL,
  '{}',
  'read_only',
  'git-branch',
  '["ast-rag","codebase","embed","pgvector","d1","phase2","agentsam_codebase_retrieve"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/ast-rag-codebase-index/SKILL.md","r2_reference_key":"skills/ast-rag-codebase-index/reference.md","phase1_script":"scripts/ast_rag_phase1_dual_repo_walk.py","phase2_script":"scripts/ast_rag_phase2_embed_symbols.py","symbol_table":"agentsam.agentsam_codebase_ast_symbols_oai3large_1536"}',
  900,
  1,
  'r2',
  1,
  13,
  datetime('now'),
  datetime('now')
);
