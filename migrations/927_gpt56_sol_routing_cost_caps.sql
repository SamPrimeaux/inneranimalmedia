-- 927: Bound uncapped gpt-5.6-sol routing arms after production cost review.
-- This is routing metadata, not a hard runtime kill switch.

UPDATE agentsam_routing_arms
SET max_cost_per_call_usd = 0.50,
    updated_at = unixepoch()
WHERE model_key = 'gpt-5.6-sol'
  AND task_type = 'agent'
  AND max_cost_per_call_usd IS NULL;

UPDATE agentsam_routing_arms
SET max_cost_per_call_usd = 0.75,
    updated_at = unixepoch()
WHERE model_key = 'gpt-5.6-sol'
  AND max_cost_per_call_usd IS NULL;
