-- 390: agentsam_tools — mybrowser handler_type for in-worker Browser Rendering tools.
-- Full table rebuild (SQLite CHECK) is in scripts/migration_390_handler_type_mybrowser.py
-- MUST drop v_mcp_tools / v_mcp_tool_drift / v_mcp_tool_execution before DROP TABLE agentsam_tools.
-- This file is idempotent for environments where rebuild already completed.

UPDATE agentsam_tools
SET handler_type = 'mybrowser',
    updated_at = unixepoch()
WHERE tool_key IN ('browser_navigate', 'browser_content', 'cdt_take_snapshot')
  AND COALESCE(handler_type, '') != 'mybrowser';
