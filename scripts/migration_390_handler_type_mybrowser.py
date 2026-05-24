#!/usr/bin/env python3
"""
Migration 390 — Add 'mybrowser' to agentsam_tools.handler_type CHECK constraint
Rebuilds the table since SQLite cannot ALTER CHECK constraints in place.

Usage:
  cd /Users/samprimeaux/inneranimalmedia
  python3 scripts/migration_390_handler_type_mybrowser.py [--dry-run]
"""

import subprocess
import sys
import os

DRY_RUN = '--dry-run' in sys.argv
DB_NAME = 'inneranimalmedia-business'
TOML    = 'wrangler.production.toml'
WRAPPER = './scripts/with-cloudflare-env.sh'

def d1(sql, label=''):
    cmd = [
        WRAPPER, 'npx', 'wrangler', 'd1', 'execute', DB_NAME,
        '--remote', '-c', TOML,
        '--command', sql
    ]
    if DRY_RUN:
        print(f'[DRY-RUN] {label}')
        print(f'  SQL: {sql[:120]}...' if len(sql) > 120 else f'  SQL: {sql}')
        return True
    print(f'Running: {label}')
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f'ERROR: {result.stderr}')
        sys.exit(1)
    print(f'  OK')
    return True

def main():
    print('=== Migration 390: handler_type mybrowser ===')
    if DRY_RUN:
        print('[DRY-RUN MODE — no changes will be applied]\n')

    # Step 1 — create new table with mybrowser in CHECK
    d1("""
CREATE TABLE agentsam_tools_new (
  id TEXT PRIMARY KEY DEFAULT ('ast_' || lower(hex(randomblob(8)))),
  tool_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  handler_type TEXT NOT NULL DEFAULT 'mcp'
    CHECK (handler_type IN (
      'mcp','r2','github','terminal','http','proxy','ai','d1',
      'hyperdrive','supabase','kv','durable_object','filesystem',
      'browser_agentic','mybrowser','telemetry','eval',
      'task.planner','task.organizer','task.manager','workspace.reader'
    )),
  description TEXT,
  input_schema TEXT,
  output_schema TEXT,
  linked_mcp_tool_id TEXT,
  mcp_service_url TEXT,
  handler_config TEXT DEFAULT '{}',
  intent_tags TEXT DEFAULT '[]',
  intent_category_tags TEXT,
  modes_json TEXT DEFAULT '["agent","plan","debug","multitask","ask"]',
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low','medium','high','critical')),
  requires_approval INTEGER NOT NULL DEFAULT 0,
  requires_confirmation INTEGER NOT NULL DEFAULT 0,
  token_budget_per_call INTEGER DEFAULT NULL,
  max_calls_per_session INTEGER DEFAULT NULL,
  cost_per_call_usd REAL DEFAULT 0.0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_degraded INTEGER NOT NULL DEFAULT 0,
  failure_rate REAL DEFAULT 0.0,
  avg_latency_ms REAL DEFAULT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER DEFAULT NULL,
  last_health_check INTEGER DEFAULT NULL,
  sort_priority INTEGER DEFAULT 50,
  workspace_scope TEXT NOT NULL DEFAULT '["*"]',
  subagent_profile_id TEXT DEFAULT NULL,
  schema_hint TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  is_global INTEGER DEFAULT 1,
  tool_key TEXT,
  capability_key TEXT,
  handler_key TEXT,
  route_key TEXT,
  workflow_key TEXT,
  task_type TEXT DEFAULT 'tool_use',
  domain TEXT DEFAULT 'general',
  capability_tier TEXT DEFAULT 'common',
  internal_seo TEXT DEFAULT '',
  tool_code TEXT DEFAULT NULL
)
""".strip(), 'Step 1 — create agentsam_tools_new with mybrowser in CHECK')

    # Step 2 — copy all rows
    d1("""
INSERT INTO agentsam_tools_new
SELECT
  id, tool_name, display_name, tool_category, handler_type,
  description, input_schema, output_schema, linked_mcp_tool_id,
  mcp_service_url, handler_config, intent_tags, intent_category_tags,
  modes_json, risk_level, requires_approval, requires_confirmation,
  token_budget_per_call, max_calls_per_session, cost_per_call_usd,
  is_active, is_degraded, failure_rate, avg_latency_ms, use_count,
  last_used_at, last_health_check, sort_priority, workspace_scope,
  subagent_profile_id, schema_hint, notes, created_at, updated_at,
  is_global, tool_key, capability_key, handler_key, route_key,
  workflow_key, task_type, domain, capability_tier, internal_seo, tool_code
FROM agentsam_tools
""".strip(), 'Step 2 — copy all rows to new table')

    # Step 3 — validate row counts match
    d1("""
SELECT
  (SELECT COUNT(*) FROM agentsam_tools) as old_count,
  (SELECT COUNT(*) FROM agentsam_tools_new) as new_count
""".strip(), 'Step 3 — validate row counts match')

    # Step 4 — update browser tools to use mybrowser handler_type
    d1("""
UPDATE agentsam_tools_new
SET handler_type = 'mybrowser'
WHERE tool_key IN ('browser_navigate','browser_content','cdt_take_snapshot')
""".strip(), 'Step 4 — update browser tools to mybrowser handler_type')

    # Step 5 — drop views that reference agentsam_tools (rename fails otherwise)
    d1('DROP VIEW IF EXISTS v_mcp_tool_execution', 'Step 5a — drop v_mcp_tool_execution')
    d1('DROP VIEW IF EXISTS v_mcp_tool_drift', 'Step 5b — drop v_mcp_tool_drift')
    d1('DROP VIEW IF EXISTS v_mcp_tools', 'Step 5c — drop v_mcp_tools')

    # Step 6 — drop old table
    d1('DROP TABLE agentsam_tools', 'Step 6 — drop agentsam_tools')

    # Step 7 — rename new table
    d1('ALTER TABLE agentsam_tools_new RENAME TO agentsam_tools',
       'Step 7 — rename agentsam_tools_new to agentsam_tools')

    # Step 8 — restore views (migration 325 definitions)
    d1("""
CREATE VIEW v_mcp_tools AS
SELECT
  t.id, t.tool_name, t.display_name, t.tool_category, t.description,
  t.input_schema, t.output_schema, t.handler_config, t.intent_tags,
  t.intent_category_tags, t.modes_json, t.risk_level, t.requires_approval,
  t.requires_confirmation, t.is_active, t.is_degraded, t.failure_rate,
  t.avg_latency_ms, t.use_count, t.mcp_service_url,
  m.trigger_type, m.trigger_config_json, m.steps_json,
  m.timeout_seconds, m.categories_json, m.user_id, m.person_uuid
FROM agentsam_tools t
LEFT JOIN agentsam_mcp_tools m ON m.agentsam_tools_id = t.id
WHERE t.handler_type = 'mcp'
""".strip(), 'Step 8a — recreate v_mcp_tools')

    d1("""
CREATE VIEW v_mcp_tool_drift AS
SELECT
  t.tool_name, t.tool_category,
  t.is_active AS enabled,
  t.mcp_service_url,
  COALESCE(c.call_count, 0) AS total_calls,
  COALESCE(c.last_called, 'never') AS last_called,
  CASE
    WHEN COALESCE(c.call_count, 0) > 0 THEN 'active'
    WHEN t.is_active = 1 THEN 'registered_unused'
    ELSE 'disabled'
  END AS status
FROM agentsam_mcp_tools t
LEFT JOIN (
  SELECT tool_name, COUNT(*) AS call_count, MAX(created_at) AS last_called
  FROM agentsam_tool_call_log
  GROUP BY tool_name
) c ON c.tool_name = t.tool_name
""".strip(), 'Step 8b — recreate v_mcp_tool_drift')

    d1("""
CREATE VIEW v_mcp_tool_execution AS
SELECT
  tc.id,
  tc.tool_id              AS tool_id,
  tc.tool_name,
  tc.input_tokens,
  tc.output_tokens,
  tc.duration_ms,
  tc.cost_usd,
  CASE WHEN tc.tool_status = 'completed' THEN 1 ELSE 0 END AS success,
  tc.error_message,
  datetime(tc.started_at, 'unixepoch') AS created_at,
  tc.agent_session_id     AS session_id,
  NULL                    AS workflow_id,
  tc.input_json,
  tc.requires_approval,
  tc.retry_count,
  tc.result_json          AS output_json
FROM agentsam_tool_chain tc
WHERE tc.tool_id IN (SELECT id FROM agentsam_tools WHERE handler_type = 'mcp')
""".strip(), 'Step 8c — recreate v_mcp_tool_execution')

    # Step 9 — verify
    d1("""
SELECT handler_type, COUNT(*) as n
FROM agentsam_tools
GROUP BY handler_type
ORDER BY n DESC
""".strip(), 'Step 9 — verify handler_type distribution')

    d1("""
SELECT tool_key, handler_type, json_extract(handler_config,'$.binding') as binding
FROM agentsam_tools
WHERE tool_key IN ('browser_navigate','browser_content','cdt_take_snapshot')
""".strip(), 'Step 10 — verify browser tools have mybrowser type')

    print('\n=== Migration 390 complete ===')
    if DRY_RUN:
        print('Run without --dry-run to apply.')

if __name__ == '__main__':
    main()
