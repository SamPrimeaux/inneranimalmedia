-- 926: Keep public D1 tool schemas generic and tenant-neutral.
-- Authorization and row-scope enforcement belong to runtime policy, not model-facing examples.

UPDATE agentsam_tools
SET description = 'Query an authorized Cloudflare D1 database using read-only SQL.',
    input_schema = json_set(
      input_schema,
      '$.properties.sql.description',
      'Read-only SQL statement to execute against the target D1 database.',
      '$.properties.database.description',
      'Cloudflare D1 database name resolved against the authenticated caller''s authorized account catalog.',
      '$.properties.database_id.description',
      'Cloudflare D1 database UUID. Use only when already known.',
      '$.properties.resource_ref.description',
      'Authorized database resource reference: name or UUID.'
    ),
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.hint',
      'Require sql. Target an authorized database by name, UUID, or resource reference.'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_d1_query';

UPDATE agentsam_tools
SET description = CASE
      WHEN tool_key = 'agentsam_d1_delete'
        THEN 'Delete data from an authorized Cloudflare D1 database.'
      ELSE 'Write to an authorized Cloudflare D1 database.'
    END,
    input_schema = json_set(
      input_schema,
      '$.properties.database.description',
      'Cloudflare D1 database name resolved against the authenticated caller''s authorized account catalog.',
      '$.properties.database_id.description',
      'Cloudflare D1 database UUID. Use only when already known.'
    ),
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.hint',
      'Require sql. Target an authorized database by name or UUID.'
    ),
    updated_at = datetime('now')
WHERE tool_key IN ('agentsam_d1_write', 'agentsam_d1_delete');
