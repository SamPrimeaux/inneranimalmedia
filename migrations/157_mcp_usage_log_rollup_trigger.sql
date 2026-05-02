-- Migration 157: MCP usage log rollup trigger + backfill
-- Purpose: Auto-aggregate mcp_tool_calls into mcp_usage_log for analytics/audit
-- Date: 2026-03-19
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/157_mcp_usage_log_rollup_trigger.sql

-- Ensure uniqueness expected by ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_usage_log_tenant_tool_date
ON mcp_usage_log(tenant_id, tool_name, date);

DROP TRIGGER IF EXISTS trg_mcp_tool_calls_usage;

CREATE TRIGGER trg_mcp_tool_calls_usage
AFTER INSERT ON mcp_tool_calls
BEGIN
  INSERT INTO mcp_usage_log (
    service_id,
    tool_name,
    session_id,
    input_summary,
    outcome,
    duration_ms,
    invoked_by,
    tenant_id,
    date,
    call_count,
    success_count,
    failure_count,
    requested_at,
    created_at
  )
  VALUES (
    'inneranimalmedia-mcp',
    NEW.tool_name,
    NEW.session_id,
    SUBSTR(COALESCE(NEW.input_schema, '{}'), 1, 200),
    CASE WHEN NEW.status = 'completed' THEN 'success' ELSE 'failure' END,
    NULL,
    COALESCE(NEW.invoked_by, 'agent_sam'),
    COALESCE(NEW.tenant_id, 'tenant_sam_primeaux'),
    DATE(COALESCE(NEW.created_at, datetime('now'))),
    1,
    CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    unixepoch(),
    unixepoch()
  )
  ON CONFLICT(tenant_id, tool_name, date) DO UPDATE SET
    call_count = call_count + 1,
    success_count = success_count + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    failure_count = failure_count + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    requested_at = unixepoch();
END;

-- Backfill historical rows
INSERT INTO mcp_usage_log (
  service_id,
  tool_name,
  tenant_id,
  date,
  call_count,
  success_count,
  failure_count,
  requested_at,
  created_at
)
SELECT
  'inneranimalmedia-mcp' AS service_id,
  tool_name,
  COALESCE(tenant_id, 'tenant_sam_primeaux') AS tenant_id,
  DATE(COALESCE(created_at, datetime('now'))) AS date,
  COUNT(*) AS call_count,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failure_count,
  unixepoch() AS requested_at,
  unixepoch() AS created_at
FROM mcp_tool_calls
GROUP BY tool_name, COALESCE(tenant_id, 'tenant_sam_primeaux'), DATE(COALESCE(created_at, datetime('now')))
ON CONFLICT(tenant_id, tool_name, date) DO UPDATE SET
  call_count = excluded.call_count,
  success_count = excluded.success_count,
  failure_count = excluded.failure_count,
  requested_at = unixepoch();

SELECT name
FROM sqlite_master
WHERE type = 'trigger' AND name = 'trg_mcp_tool_calls_usage';
