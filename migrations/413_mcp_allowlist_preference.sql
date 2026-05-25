-- 413: Per-tool MCP allowlist preference (deny = no row; read|ask|allow stored on row).
-- notes may already exist on production; preference is the required add.

ALTER TABLE agentsam_mcp_allowlist ADD COLUMN preference TEXT NOT NULL DEFAULT 'allow';

UPDATE agentsam_mcp_allowlist
SET preference = 'allow'
WHERE preference IS NULL OR trim(preference) = '';
