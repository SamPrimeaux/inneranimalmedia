-- 134: MCP usage log (daily aggregates by tenant + tool + date)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/134_mcp_usage_log.sql
-- Purpose: Aggregate mcp_tool_calls for dashboards; upsert on each tool call.

CREATE TABLE IF NOT EXISTS mcp_usage_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  date TEXT NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tenant_id, tool_name, date)
);
CREATE INDEX IF NOT EXISTS idx_mcp_usage_log_tenant_date ON mcp_usage_log(tenant_id, date);
