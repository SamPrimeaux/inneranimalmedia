-- Migration 161: Replace rollup trigger with minimal schema matching mcp_usage_log (134) + ON CONFLICT
-- Avoids duplicate increments: recordMcpToolCall no longer INSERTs mcp_usage_log (worker.js); trigger only.
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/161_mcp_usage_log_trigger_minimal.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_usage_log_tenant_tool_date
ON mcp_usage_log(tenant_id, tool_name, date);

DROP TRIGGER IF EXISTS trg_mcp_tool_calls_usage;

CREATE TRIGGER trg_mcp_tool_calls_usage
AFTER INSERT ON mcp_tool_calls
BEGIN
  INSERT INTO mcp_usage_log (id, tenant_id, tool_name, date, call_count, success_count, failure_count)
  VALUES (
    lower(hex(randomblob(16))),
    COALESCE(NEW.tenant_id, 'tenant_sam_primeaux'),
    NEW.tool_name,
    date(COALESCE(NEW.created_at, datetime('now'))),
    1,
    CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END
  )
  ON CONFLICT(tenant_id, tool_name, date) DO UPDATE SET
    call_count = call_count + 1,
    success_count = success_count + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    failure_count = failure_count + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END;
END;
