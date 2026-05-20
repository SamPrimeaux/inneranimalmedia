-- 357: Ensure intent_classification prompt route prefers Haiku (355 INSERT OR IGNORE may have skipped).
UPDATE agentsam_prompt_routes
SET preferred_model = 'anthropic_haiku_4_5',
    max_tools = 0,
    updated_at = unixepoch()
WHERE route_key = 'intent_classification';
