-- Give active GPT-5.6 tool-capable models neutral-prior coverage in the
-- workspace code lane. Do not boost priors; Thompson must learn from outcomes.

INSERT OR IGNORE INTO agentsam_routing_arms (
  id, model_key, task_type, mode, provider, priority, workspace_id,
  is_active, is_eligible, is_paused, supports_tools, reasoning_effort,
  fallback_model_key, success_alpha, success_beta, decayed_score,
  last_decay_at, updated_at
) VALUES
  (
    'ra_gpt56sol_code', 'gpt-5.6-sol', 'code', 'agent', 'openai', 64,
    'ws_inneranimalmedia', 1, 1, 0, 1, 'high', 'claude-sonnet-5',
    1, 1, 0.5, unixepoch(), unixepoch()
  ),
  (
    'ra_gpt56terra_code', 'gpt-5.6-terra', 'code', 'agent', 'openai', 61,
    'ws_inneranimalmedia', 1, 1, 0, 1, 'medium', 'gpt-5.6-sol',
    1, 1, 0.5, unixepoch(), unixepoch()
  ),
  (
    'ra_gpt56luna_code', 'gpt-5.6-luna', 'code', 'agent', 'openai', 58,
    'ws_inneranimalmedia', 1, 1, 0, 1, 'low', 'gpt-5.6-terra',
    1, 1, 0.5, unixepoch(), unixepoch()
  );
