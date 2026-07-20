-- Keep commit/save/search active for outbox memory path.
UPDATE agentsam_tools
SET is_active = 1, updated_at = unixepoch()
WHERE tool_key IN ('agentsam_memory_commit', 'agentsam_memory_save', 'agentsam_memory_search');
