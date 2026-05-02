-- Migration 158: MCP tool drift detection view
-- Purpose: Detect registered tools that are unused or have no runtime activity
-- Date: 2026-03-19
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/158_mcp_tool_drift_view.sql

CREATE VIEW IF NOT EXISTS v_mcp_tool_drift AS
SELECT
  t.tool_name,
  t.tool_category,
  t.enabled,
  t.mcp_service_url,
  COALESCE(c.call_count, 0) AS total_calls,
  COALESCE(c.last_called, 'never') AS last_called,
  CASE
    WHEN COALESCE(c.call_count, 0) > 0 THEN 'active'
    WHEN t.enabled = 1 THEN 'registered_unused'
    ELSE 'disabled'
  END AS status
FROM mcp_registered_tools t
LEFT JOIN (
  SELECT
    tool_name,
    COUNT(*) AS call_count,
    MAX(created_at) AS last_called
  FROM mcp_tool_calls
  GROUP BY tool_name
) c ON c.tool_name = t.tool_name
ORDER BY total_calls DESC, t.tool_name;

SELECT status, COUNT(*) AS tool_count
FROM v_mcp_tool_drift
GROUP BY status
ORDER BY status;
