-- 415: Remove any operator-specific rows if migration 414 was applied with hardcoded au_* seeds.
-- User allowlist is written at OAuth consent approve from session identity only.

DELETE FROM agentsam_mcp_oauth_user_client_allowlist
WHERE notes LIKE '%Operator allowlist%'
   OR notes LIKE '%sam@inneranimalmedia.com%';
