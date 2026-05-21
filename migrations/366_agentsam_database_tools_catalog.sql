-- 366: Database Studio tool catalog alignment (D1 + Hyperdrive) and agent_database route caps.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/366_agentsam_database_tools_catalog.sql

-- ── D1 tools (ensure active + correct risk/approval) ────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type, description,
  input_schema, risk_level, requires_approval, is_active, workspace_scope, modes_json, intent_tags, updated_at
) VALUES
(
  'ast_d1_query_global',
  'd1_query',
  'D1 Query (read-only)',
  'database.d1.query',
  'd1',
  'Execute read-only SELECT / EXPLAIN / safe WITH / safe PRAGMA against workspace D1.',
  '{"type":"object","required":["sql"],"properties":{"sql":{"type":"string"},"params":{"type":"array"},"workspace_id":{"type":"string"},"user_id":{"type":"string"}}}',
  'medium',
  0,
  1,
  '["*"]',
  '["auto","build","chat","agent"]',
  '["d1","database","sql","select"]',
  unixepoch()
),
(
  'ast_d1_schema_global',
  'd1_schema',
  'D1 Schema Introspect',
  'database.d1.schema',
  'd1',
  'List tables or PRAGMA table_info for a table. Alias dispatches to d1_schema_introspect handler.',
  '{"type":"object","properties":{"table":{"type":"string"},"workspace_id":{"type":"string"},"user_id":{"type":"string"}}}',
  'low',
  0,
  1,
  '["*"]',
  '["auto","build","chat","agent"]',
  '["d1","schema","tables"]',
  unixepoch()
),
(
  'ast_d1_explain_global',
  'd1_explain',
  'D1 Explain Query Plan',
  'database.d1.explain',
  'd1',
  'EXPLAIN QUERY PLAN for a read-only SELECT/WITH.',
  '{"type":"object","required":["sql"],"properties":{"sql":{"type":"string"},"workspace_id":{"type":"string"},"user_id":{"type":"string"}}}',
  'low',
  0,
  1,
  '["*"]',
  '["auto","build","chat","agent"]',
  '["d1","explain","sql"]',
  unixepoch()
),
(
  'ast_d1_write_global',
  'd1_write',
  'D1 Write (approval-gated)',
  'database.d1.write',
  'd1',
  'INSERT/UPDATE/DELETE/DDL on D1 — superadmin + dashboard approval required.',
  '{"type":"object","required":["sql"],"properties":{"sql":{"type":"string"},"params":{"type":"array"},"workspace_id":{"type":"string"},"user_id":{"type":"string"}}}',
  'high',
  1,
  1,
  '["*"]',
  '["agent","auto"]',
  '["d1","database","sql","mutation"]',
  unixepoch()
),
(
  'ast_d1_batch_write_global',
  'd1_batch_write',
  'D1 Batch Write (approval-gated)',
  'database.d1.batch',
  'd1',
  'Batch D1 mutations — superadmin + dashboard approval required.',
  '{"type":"object","required":["queries"],"properties":{"queries":{"type":"array"},"workspace_id":{"type":"string"},"user_id":{"type":"string"}}}',
  'critical',
  1,
  1,
  '["*"]',
  '["agent"]',
  '["d1","database","sql","batch"]',
  unixepoch()
);

-- ── Hyperdrive / Postgres tools ─────────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type, description,
  input_schema, risk_level, requires_approval, is_active, workspace_scope, modes_json, intent_tags, updated_at
) VALUES
(
  'ast_hyperdrive_query_global',
  'hyperdrive_query',
  'Hyperdrive SQL Query',
  'database.hyperdrive.query',
  'builtin',
  'Read-only SELECT/EXPLAIN on Supabase via Hyperdrive for non-superadmin; mutations require approval.',
  '{"type":"object","required":["sql"],"properties":{"sql":{"type":"string"},"params":{"type":"array"},"workspace_id":{"type":"string"},"user_id":{"type":"string"}}}',
  'medium',
  0,
  1,
  '["*"]',
  '["auto","build","chat","agent"]',
  '["hyperdrive","postgres","supabase","sql"]',
  unixepoch()
),
(
  'ast_hyperdrive_schema_global',
  'hyperdrive_schema',
  'Hyperdrive Schema Introspect',
  'database.hyperdrive.schema',
  'builtin',
  'List public tables or column metadata via information_schema.',
  '{"type":"object","properties":{"table":{"type":"string"},"workspace_id":{"type":"string"},"user_id":{"type":"string"}}}',
  'low',
  0,
  1,
  '["*"]',
  '["auto","build","chat","agent"]',
  '["hyperdrive","postgres","schema"]',
  unixepoch()
),
(
  'ast_hyperdrive_explain_global',
  'hyperdrive_explain',
  'Hyperdrive Explain',
  'database.hyperdrive.explain',
  'builtin',
  'EXPLAIN for read-only Postgres statements via Hyperdrive.',
  '{"type":"object","required":["sql"],"properties":{"sql":{"type":"string"},"workspace_id":{"type":"string"},"user_id":{"type":"string"}}}',
  'low',
  0,
  1,
  '["*"]',
  '["auto","build","chat","agent"]',
  '["hyperdrive","postgres","explain"]',
  unixepoch()
);

-- ── agent_database route requirements (registered capabilities only) ────────
UPDATE agentsam_route_requirements
SET
  task_type = 'database',
  required_capability_keys_json = '["d1.read"]',
  optional_capability_keys_json = '["d1.schema","d1.explain","d1.write","d1.batch_write","hyperdrive.read","hyperdrive.schema","hyperdrive.explain"]',
  blocked_capability_keys_json = '["terminal_execute","terminal_run","terminal_wrangler","worker.deploy"]'
WHERE route_key = 'agent_database';
