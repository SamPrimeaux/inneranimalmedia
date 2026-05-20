-- Idempotent follow-up: canonical Anthropic model_key on routing arms (361 UNIQUE fix).
-- Safe when agentsam_model_pricing already seeded.

DELETE FROM agentsam_routing_arms
WHERE model_key = 'anthropic_haiku_4_5'
  AND EXISTS (
    SELECT 1 FROM agentsam_routing_arms c
    WHERE c.workspace_id = agentsam_routing_arms.workspace_id
      AND c.task_type = agentsam_routing_arms.task_type
      AND c.mode = agentsam_routing_arms.mode
      AND c.model_key = 'claude-haiku-4-5-20251001'
  );

DELETE FROM agentsam_routing_arms
WHERE model_key = 'anthropic_sonnet_4_6'
  AND EXISTS (
    SELECT 1 FROM agentsam_routing_arms c
    WHERE c.workspace_id = agentsam_routing_arms.workspace_id
      AND c.task_type = agentsam_routing_arms.task_type
      AND c.mode = agentsam_routing_arms.mode
      AND c.model_key = 'claude-sonnet-4-6'
  );

DELETE FROM agentsam_routing_arms
WHERE model_key = 'anthropic_opus_4_7'
  AND EXISTS (
    SELECT 1 FROM agentsam_routing_arms c
    WHERE c.workspace_id = agentsam_routing_arms.workspace_id
      AND c.task_type = agentsam_routing_arms.task_type
      AND c.mode = agentsam_routing_arms.mode
      AND c.model_key IN ('claude-opus-4-7', 'claude-opus-4-6')
  );

UPDATE agentsam_routing_arms SET model_key = 'claude-haiku-4-5-20251001', updated_at = unixepoch()
WHERE model_key = 'anthropic_haiku_4_5';

UPDATE agentsam_routing_arms SET model_key = 'claude-sonnet-4-6', updated_at = unixepoch()
WHERE model_key = 'anthropic_sonnet_4_6';

UPDATE agentsam_routing_arms SET model_key = 'claude-opus-4-7', updated_at = unixepoch()
WHERE model_key = 'anthropic_opus_4_7';

UPDATE agentsam_prompt_routes SET preferred_model = 'claude-haiku-4-5-20251001', updated_at = unixepoch()
WHERE preferred_model = 'anthropic_haiku_4_5';

UPDATE agentsam_prompt_routes SET preferred_model = 'claude-sonnet-4-6', updated_at = unixepoch()
WHERE preferred_model = 'anthropic_sonnet_4_6';
