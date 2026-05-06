-- 255: Scope agentsam_mcp_tools rows by tenant / workspace (nullable — legacy/global rows unchanged).
-- Apply remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/255_agentsam_mcp_tools_tenant_workspace.sql
-- If a column already exists, skip that statement or run once per environment.

ALTER TABLE agentsam_mcp_tools ADD COLUMN tenant_id TEXT;
ALTER TABLE agentsam_mcp_tools ADD COLUMN workspace_id TEXT;
