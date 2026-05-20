-- Reactivate canonical Anthropic catalog rows (361 catalog UPDATE may not have run).
UPDATE agentsam_model_catalog SET
  provider = 'anthropic',
  anthropic_model_id = model_key,
  is_active = 1,
  is_degraded = 0,
  degraded_reason = NULL,
  updated_at = unixepoch()
WHERE model_key IN (
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-opus-4-7'
);

UPDATE agentsam_model_catalog SET
  cost_per_1k_in = 0.001,
  cost_per_1k_out = 0.005,
  context_window = 200000,
  max_output_tokens = 64000
WHERE model_key = 'claude-haiku-4-5-20251001';

UPDATE agentsam_model_catalog SET
  cost_per_1k_in = 0.003,
  cost_per_1k_out = 0.015,
  context_window = 1000000,
  max_output_tokens = 128000
WHERE model_key = 'claude-sonnet-4-6';

UPDATE agentsam_model_catalog SET
  cost_per_1k_in = 0.005,
  cost_per_1k_out = 0.025,
  context_window = 1000000,
  max_output_tokens = 128000
WHERE model_key IN ('claude-opus-4-6', 'claude-opus-4-7');
