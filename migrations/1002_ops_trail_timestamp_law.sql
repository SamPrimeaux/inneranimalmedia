-- 1002: Ops trail timestamp law — backfill *_unix, unified view, rule doc, ticket.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/1002_ops_trail_timestamp_law.sql

-- 1) Backfill epoch dual-columns (INTEGER created_at → created_at_unix)
UPDATE agentsam_tool_call_log
SET created_at_unix = created_at
WHERE (created_at_unix IS NULL OR created_at_unix = 0)
  AND typeof(created_at) = 'integer'
  AND created_at > 1_000_000_000;

UPDATE agentsam_usage_events
SET created_at_unix = created_at
WHERE (created_at_unix IS NULL OR created_at_unix = 0)
  AND typeof(created_at) = 'integer'
  AND created_at > 1_000_000_000;

-- 2) Backfill TEXT created_at tables → created_at_unix
UPDATE agentsam_agent_run
SET created_at_unix = CAST(strftime('%s', created_at) AS INTEGER)
WHERE (created_at_unix IS NULL OR created_at_unix = 0)
  AND created_at IS NOT NULL
  AND length(trim(created_at)) >= 10
  AND CAST(strftime('%s', created_at) AS INTEGER) > 1_000_000_000;

UPDATE agentsam_mcp_tool_execution
SET created_at_unix = CAST(strftime('%s', created_at) AS INTEGER)
WHERE (created_at_unix IS NULL OR created_at_unix = 0)
  AND created_at IS NOT NULL
  AND length(trim(created_at)) >= 10
  AND CAST(strftime('%s', created_at) AS INTEGER) > 1_000_000_000;

UPDATE agentsam_deployment_health
SET checked_at_unix = CAST(strftime('%s', checked_at) AS INTEGER)
WHERE (checked_at_unix IS NULL OR checked_at_unix = 0)
  AND checked_at IS NOT NULL
  AND length(trim(checked_at)) >= 10
  AND CAST(strftime('%s', checked_at) AS INTEGER) > 1_000_000_000;

UPDATE agentsam_deployment_health
SET last_checked_at = checked_at_unix
WHERE last_checked_at IS NULL
  AND checked_at_unix IS NOT NULL
  AND checked_at_unix > 0;

-- 3) Mark tonight's known-fixed parse errors resolved (trail hygiene)
UPDATE agentsam_error_log
SET resolved = 1
WHERE COALESCE(resolved, 0) = 0
  AND error_message = 'tool_arguments_json_parse_error'
  AND created_at >= unixepoch() - 86400;

-- 4) Unified ops trail view (epoch-seconds only)
-- D1/SQLite compound SELECT limit: keep ≤5 branches (usage_events queried separately in ops-trail-24h.mjs).
DROP VIEW IF EXISTS v_agentsam_ops_trail;
CREATE VIEW v_agentsam_ops_trail AS
SELECT
  'agent_run' AS source_table,
  id AS event_id,
  COALESCE(created_at_unix, CAST(strftime('%s', created_at) AS INTEGER)) AS ts_unix,
  COALESCE(status, 'unknown') AS event_kind,
  COALESCE(workspace_id, '') AS workspace_id,
  COALESCE(user_id, '') AS user_id,
  COALESCE(conversation_id, '') AS conversation_id,
  COALESCE(model_key, '') AS detail,
  CAST(NULL AS TEXT) AS error_message
FROM agentsam_agent_run
WHERE created_at_unix IS NOT NULL

UNION ALL
SELECT
  'tool_call_log',
  id,
  COALESCE(created_at_unix, created_at),
  COALESCE(status, 'unknown'),
  COALESCE(workspace_id, ''),
  COALESCE(user_id, ''),
  COALESCE(conversation_id, ''),
  COALESCE(tool_name, ''),
  error_message
FROM agentsam_tool_call_log
WHERE COALESCE(created_at_unix, created_at) IS NOT NULL

UNION ALL
SELECT
  'error_log',
  id,
  created_at,
  COALESCE(error_type, 'error'),
  COALESCE(workspace_id, ''),
  '',
  COALESCE(session_id, ''),
  COALESCE(source, ''),
  error_message
FROM agentsam_error_log
WHERE created_at IS NOT NULL

UNION ALL
SELECT
  'mcp_tool_execution',
  CAST(id AS TEXT),
  COALESCE(created_at_unix, CAST(strftime('%s', created_at) AS INTEGER)),
  CASE WHEN success = 1 THEN 'success' ELSE 'error' END,
  COALESCE(workspace_id, ''),
  COALESCE(user_id, ''),
  COALESCE(session_id, ''),
  COALESCE(tool_name, ''),
  error_message
FROM agentsam_mcp_tool_execution
WHERE created_at_unix IS NOT NULL

UNION ALL
SELECT
  'deployment_health',
  id,
  COALESCE(checked_at_unix, last_checked_at),
  COALESCE(status, 'health'),
  COALESCE(workspace_id, ''),
  '',
  '',
  COALESCE(worker_name, ''),
  error_message
FROM agentsam_deployment_health
WHERE COALESCE(checked_at_unix, last_checked_at) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_tool_call_log_created_at_unix
  ON agentsam_tool_call_log(created_at_unix);
CREATE INDEX IF NOT EXISTS idx_agentsam_usage_events_created_at_unix
  ON agentsam_usage_events(created_at_unix);
CREATE INDEX IF NOT EXISTS idx_agentsam_error_log_created_at
  ON agentsam_error_log(created_at);
CREATE INDEX IF NOT EXISTS idx_agentsam_deployment_health_checked_at_unix
  ON agentsam_deployment_health(checked_at_unix);

-- 5) Platform rule (agents query this)
INSERT OR REPLACE INTO agentsam_rules_document (
  id, rule_key, title, body_markdown, is_active, created_at_epoch, updated_at_epoch, sort_order, rule_type
) VALUES (
  'rule_ops_trail_timestamp',
  'rule_ops_trail_timestamp',
  'LOCKED: Ops trail timestamp law — epoch windows only',
  '# Ops trail timestamp law (LOCKED)

## Footgun
`agentsam_agent_run.created_at` and `agentsam_mcp_tool_execution.created_at` are **TEXT ISO**.
`agentsam_tool_call_log.created_at`, `agentsam_usage_events.created_at`, and `agentsam_error_log.created_at` are **INTEGER epoch seconds**.
Same name, different meaning. Filtering TEXT `created_at` with `unixepoch()-86400` silently returns wrong rows.

## Law
1. Time windows ALWAYS use epoch-seconds: `created_at_unix` / `checked_at_unix`, or `COALESCE(created_at_unix, created_at)` only when `created_at` is INTEGER.
2. Canonical query surface: `v_agentsam_ops_trail` + `ts_unix >= unixepoch()-86400`.
3. Writers dual-write TEXT ISO + `*_unix` on hybrid tables; dual-write `created_at` + `created_at_unix` on epoch-native tables.
4. Script: `node scripts/ops-trail-24h.mjs`

## Dead / sparse tables
- `agentsam_deployment_health` — must be written on every deploy:fast/full (not only eval cron).
- `agentsam_tool_result_policy_log` — only fills when `agentsam_tools.result_policy_json` is set (today ~1 tool).
- `agentsam_data_quality_snapshots` — offline profiler artifact; not a live monitor.
- `agentsam_error_log.resolved` — must be set by Problems UI / deploy fix hygiene; not cosmetic.
- `user_oauth_tokens.is_active` — must flip to 0 on expiry without refresh / refresh failure (see rule_oauth_token_liveness).
',
  1,
  unixepoch(),
  unixepoch(),
  50,
  'platform'
);

INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, created_at, updated_at, closed_at,
  consecutive_pass_count, required_pass_count
) VALUES (
  'tkt_ops_trail_timestamp_law',
  'Ops trail: unify epoch timestamps + v_agentsam_ops_trail',
  'active',
  'Backfill *_unix, dual-write writers, deploy health on fast path, 24h trail script',
  'inneranimalmedia',
  'observability',
  '["p0","d1","timestamps","audit"]',
  'P0',
  'plans/active/AGENTSAM-FILE-CREATE-HTML-FAILURES-2026-07-22.md',
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL,
  0,
  2
);
