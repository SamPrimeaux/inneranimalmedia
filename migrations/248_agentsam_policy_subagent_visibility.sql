-- Subagent platform visibility flag.
-- agentsam_user_policy extensions (require_allowlist_for_mcp, tool_risk_level_max,
-- allow_subagent_spawn, max_tool_chain_depth, max_spawn_depth, cost caps) are already
-- present on inneranimalmedia-business; do not re-ADD them here (duplicate column error).

ALTER TABLE agentsam_subagent_profile ADD COLUMN is_platform_global INTEGER NOT NULL DEFAULT 0;
