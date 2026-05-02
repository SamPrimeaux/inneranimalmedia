-- Workflows JSON audit (json_valid requires SQLite 3.38+; D1 supports it)
SELECT
  id,
  name,
  workflow_type,
  is_active,
  json_valid(steps) AS steps_valid,
  json_valid(trigger_config) AS trigger_config_valid
FROM workflows
ORDER BY created_at;
