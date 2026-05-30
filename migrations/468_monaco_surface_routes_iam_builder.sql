-- Register i-am-builder-monaco for surface preflight (monaco editor / code implementation).
-- Idempotent: json_set only when surface_routes.monaco is absent.

UPDATE agentsam_workflows
SET metadata_json = json_set(
  COALESCE(NULLIF(trim(metadata_json), ''), '{}'),
  '$.surface_routes',
  json_object(
    'monaco', json_array('*'),
    'code', json_array('*'),
    'chat', json_array('code', 'implement', 'monaco')
  )
),
updated_at = unixepoch()
WHERE workflow_key = 'i-am-builder-monaco'
  AND (
    json_extract(COALESCE(NULLIF(trim(metadata_json), ''), '{}'), '$.surface_routes.monaco') IS NULL
  );
