-- 857: Supabase classifier lane — keywords, tool profiles, bindings, escalate cues.
-- Parity with live D1 inserts (MCP) + JS classifier sync (22afb7fa).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/857_supabase_classifier_lane.sql

-- ── chat_intent_supabase_* keywords (16) ─────────────────────────────────────
INSERT OR IGNORE INTO agentsam_classification_keywords (id, purpose, pattern, label, active, notes) VALUES
('ck_sbm_1', 'chat_intent_supabase_migration', 'supabase migration', 'agent', 1, 'Approval-gated: schema/RLS change'),
('ck_sbm_2', 'chat_intent_supabase_migration', 'alter postgres', 'agent', 1, 'Approval-gated: schema/RLS change'),
('ck_sbm_3', 'chat_intent_supabase_migration', 'rls policy', 'agent', 1, 'Approval-gated: schema/RLS change'),
('ck_sbm_4', 'chat_intent_supabase_migration', 'row level security', 'agent', 1, 'Approval-gated: schema/RLS change'),
('ck_sbm_5', 'chat_intent_supabase_migration', 'propose migration', 'agent', 1, 'Approval-gated: schema/RLS change'),
('ck_sbw_1', 'chat_intent_supabase_write', 'supabase write', 'agent', 1, 'Supabase/Postgres write (blunt)'),
('ck_sbw_2', 'chat_intent_supabase_write', 'insert into supabase', 'agent', 1, 'Supabase/Postgres write (blunt)'),
('ck_sbw_3', 'chat_intent_supabase_write', 'update postgres', 'agent', 1, 'Supabase/Postgres write (blunt)'),
('ck_sbw_4', 'chat_intent_supabase_write', 'delete from supabase', 'agent', 1, 'Supabase/Postgres write (blunt)'),
('ck_sbq_1', 'chat_intent_supabase_query', 'supabase query', 'agent', 1, 'Supabase/Postgres read-only'),
('ck_sbq_2', 'chat_intent_supabase_query', 'query postgres', 'agent', 1, 'Supabase/Postgres read-only'),
('ck_sbq_3', 'chat_intent_supabase_query', 'select from supabase', 'agent', 1, 'Supabase/Postgres read-only'),
('ck_sbq_4', 'chat_intent_supabase_query', 'supabase table', 'agent', 1, 'Supabase/Postgres read-only'),
('ck_sbv_1', 'chat_intent_supabase_vector', 'pgvector', 'agent', 1, 'Supabase/pgvector embeddings'),
('ck_sbv_2', 'chat_intent_supabase_vector', 'supabase vector', 'agent', 1, 'Supabase/pgvector embeddings'),
('ck_sbv_3', 'chat_intent_supabase_vector', 'supabase embedding', 'agent', 1, 'Supabase/pgvector embeddings');

-- ── chat_intent_escalate — genuine ambiguity cues (7 new; 824 seeds 4 base) ───
INSERT OR IGNORE INTO agentsam_classification_keywords (id, purpose, pattern, label, active, notes) VALUES
('ck_esc_5', 'chat_intent_escalate', 'which is better', NULL, 1, 'Genuine ambiguity signal — user comparing options'),
('ck_esc_6', 'chat_intent_escalate', 'should i', NULL, 1, 'Genuine ambiguity signal'),
('ck_esc_7', 'chat_intent_escalate', 'pros and cons', NULL, 1, 'Genuine ambiguity signal'),
('ck_esc_8', 'chat_intent_escalate', 'either way', NULL, 1, 'Genuine ambiguity signal'),
('ck_esc_9', 'chat_intent_escalate', 'not certain', NULL, 1, 'Genuine ambiguity signal'),
('ck_esc_10', 'chat_intent_escalate', 'torn between', NULL, 1, 'Genuine ambiguity signal'),
('ck_esc_11', 'chat_intent_escalate', 'what would you do', NULL, 1, 'Genuine ambiguity signal');

-- ── tool profiles (4) ───────────────────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth, write_policy_json, notes, is_active, sort_order, updated_at
) VALUES
(
  'atprof_supabase_read',
  'supabase_read',
  'Supabase Read',
  '["agentsam_supabase_query","agentsam_supabase_project_query","agentsam_supabase_vector","agentsam_memory_manager"]',
  8,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false,"can_postgres_write":false}',
  'Supabase/Postgres read lane — mirrors d1_read',
  1,
  50,
  unixepoch()
),
(
  'atprof_supabase_write',
  'supabase_write',
  'Supabase Write',
  '["agentsam_supabase_write","agentsam_supabase_project_write","agentsam_supabase_query","agentsam_memory_manager"]',
  8,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false,"can_postgres_write":true}',
  'Supabase/Postgres write lane — tool-level requires_approval=1 already gates execution',
  1,
  50,
  unixepoch()
),
(
  'atprof_supabase_migration',
  'supabase_migration',
  'Supabase Migration',
  '["agentsam_supabase_write","agentsam_supabase_project_write","agentsam_supabase_query","agentsam_memory_manager"]',
  8,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false,"can_postgres_write":true,"can_postgres_migrate":true}',
  'Schema/RLS change lane — approval-gated, mirrors dormant customer_supabase_propose_migration intent',
  1,
  50,
  unixepoch()
),
(
  'atprof_supabase_vector',
  'supabase_vector',
  'Supabase Vector',
  '["agentsam_supabase_vector","agentsam_supabase_query","agentsam_memory_manager"]',
  8,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false}',
  'pgvector semantic search lane',
  1,
  50,
  unixepoch()
);

-- ── task_type → profile bindings (4) ─────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tool_profile_bindings (id, task_type, profile_key, priority, notes, updated_at) VALUES
('atpb_supabase_query', 'supabase_query', 'supabase_read', 50, 'Supabase/Postgres read', unixepoch()),
('atpb_supabase_write', 'supabase_write', 'supabase_write', 50, 'Supabase/Postgres write', unixepoch()),
('atpb_supabase_migration', 'supabase_migration', 'supabase_migration', 50, 'Supabase/Postgres schema/RLS — approval gated', unixepoch()),
('atpb_supabase_vector', 'supabase_vector', 'supabase_vector', 50, 'pgvector semantic search', unixepoch());
