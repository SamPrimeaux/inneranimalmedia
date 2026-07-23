-- 1011: Delete retired / pointless workspace registry rows (operator cull 2026-07-22).
-- NOTE: Batch apply hit FK on dashboard_assets / quality_runs — completed by 1012.
-- Does NOT drop Cloudflare D1 databases — only workspace identity rows + children.
-- Keep live MCP transport ws_inneranimalmedia_mcp; this removes legacy ws_inneranimal_mcp only.

-- Prefer applying 1012 (supersedes). Kept for history / partial environments.
SELECT 1 WHERE 0;
