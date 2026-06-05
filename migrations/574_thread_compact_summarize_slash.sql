-- 574: /compact and /summarize slash commands (in_app router → thread-on-demand.js).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/574_thread_compact_summarize_slash.sql

INSERT OR IGNORE INTO agentsam_commands (
  id, workspace_id, tenant_id, slug, display_name, description, pattern, pattern_type,
  mapped_command, category, subcategory, risk_level, requires_confirmation,
  show_in_slash, show_in_palette, sort_order, is_active, is_global, execution_mode,
  router_type, tool_key, internal_seo, created_at, updated_at
) VALUES
(
  'cmd_thread_compact',
  'platform',
  NULL,
  '/compact',
  'Compact thread',
  'Summarize older turns into R2/D1 digest; keeps last 6 messages hot. Reduces context size for the next reply.',
  '/compact',
  'exact',
  'thread.compact',
  'context',
  'compaction',
  'low',
  0,
  1,
  1,
  5,
  1,
  1,
  'agent',
  'in_app',
  'thread.compact',
  'slash_thread_compact',
  datetime('now'),
  datetime('now')
),
(
  'cmd_thread_summarize',
  'platform',
  NULL,
  '/summarize',
  'Summarize thread',
  'Post-archive LLM summary via Supabase summarize-thread (session_summaries). Non-blocking long-term recall.',
  '/summarize',
  'exact',
  'thread.summarize',
  'context',
  'compaction',
  'low',
  0,
  1,
  1,
  6,
  1,
  1,
  'agent',
  'in_app',
  'thread.summarize',
  'slash_thread_summarize',
  datetime('now'),
  datetime('now')
);

UPDATE agentsam_commands SET
  router_type = 'in_app',
  tool_key = 'thread.compact',
  category = 'context',
  subcategory = 'compaction',
  show_in_slash = 1,
  is_active = 1,
  is_global = 1,
  updated_at = datetime('now')
WHERE id = 'cmd_thread_compact';

UPDATE agentsam_commands SET
  router_type = 'in_app',
  tool_key = 'thread.summarize',
  category = 'context',
  subcategory = 'compaction',
  show_in_slash = 1,
  is_active = 1,
  is_global = 1,
  updated_at = datetime('now')
WHERE id = 'cmd_thread_summarize';
