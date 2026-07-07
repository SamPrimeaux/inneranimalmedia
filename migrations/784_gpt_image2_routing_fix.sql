-- Idempotent fix: gpt-image-2 must route to OpenAI, not Workers AI via api_platform='unknown'.
-- Also reset Thompson beta penalty accumulated from misrouted failures.

UPDATE agentsam_ai
SET
  api_platform = 'openai',
  secret_key_name = 'OPENAI_API_KEY',
  updated_at = unixepoch()
WHERE model_key = 'gpt-image-2'
  AND (api_platform IS NULL OR api_platform = '' OR api_platform = 'unknown' OR secret_key_name IS NULL OR secret_key_name = '');

UPDATE agentsam_routing_arms
SET
  success_beta = 1,
  updated_at = unixepoch()
WHERE task_type = 'image_generation'
  AND model_key = 'gpt-image-2'
  AND success_beta > 1;
