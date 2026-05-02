-- 134 add: mcp_usage_log may already exist without tenant_id; add it so CREATE INDEX in 134 succeeds.
-- Run after 134 fails with "no such column: tenant_id", then re-run 134.

ALTER TABLE mcp_usage_log ADD COLUMN tenant_id TEXT DEFAULT 'tenant_sam_primeaux';
