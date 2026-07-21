-- 955: Activate agentsam_codebase_retrieve for in-app (oauth_visible stays 0 until MCP allowlist).
-- Freshness: npm run ast-rag:refresh after meaningful src/ changes (not inside deploy).

UPDATE agentsam_tools
SET
  is_active = 1,
  handler_type = 'agent',
  handler_key = 'agentsam_codebase_retrieve',
  dispatch_target = 'internal',
  oauth_visible = 0,
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_codebase_retrieve';

INSERT OR IGNORE INTO agentsam_rules_document (
  id,
  rule_key,
  user_id,
  workspace_id,
  title,
  body_markdown,
  version,
  is_active,
  created_at_epoch,
  updated_at_epoch,
  apply_mode,
  rule_type,
  trigger_type,
  sort_order,
  notes,
  source_stored
) VALUES (
  'rule_ast_rag_freshness',
  'rule_ast_rag_freshness',
  '',
  'ws_inneranimalmedia',
  'AST-RAG index freshness (nodes / symbols / chunks)',
  '## AST-RAG freshness (LOCKED)

After shipping code under `src/`, `dashboard/src/`, or MCP `src/`:

1. **Structural + symbol ANN:** `npm run ast-rag:refresh` (or `python3 scripts/ast_rag_refresh_incremental.py --commit`). Uses `file_hash` + git diff; skips unchanged files; re-embeds only touched symbols.
2. **Chunk RAG text:** existing `agentsam_code_index_job` / reindex scripts (separate lane).
3. **Chunk↔node links:** Phase-2 `--chunk 3` full link, or refresh with `--relink-files` for touched paths only.
4. **Do not** full Phase-1 re-walk daily. **Do not** block `deploy:fast`/`deploy:full` on AST refresh (opt-in post-ship).
5. Stale symptom: `agentsam_codebase_retrieve` returns old/wrong symbols — refresh then smoke Phase-2 chunk 4.
',
  1,
  1,
  unixepoch(),
  unixepoch(),
  'always',
  'platform',
  'always',
  40,
  'Pairs with scripts/ast_rag_refresh_incremental.py + codebase-ast-retrieve.js',
  'migration_955'
);
