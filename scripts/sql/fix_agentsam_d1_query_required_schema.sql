-- Fix d1_query tool schema so providers know sql is required.
-- This prevents d1_query tool calls from arriving as args:{}.

UPDATE agentsam_tools
SET
  input_schema = json_object(
    'type', 'object',
    'properties', json_object(
      'sql', json_object(
        'type', 'string',
        'description', 'Read-only SQL query to execute against D1. Must start with SELECT, PRAGMA, WITH, or EXPLAIN.'
      ),
      'params', json_object(
        'type', 'array',
        'items', json_object(),
        'description', 'Optional positional bind parameters for the SQL query.'
      ),
      'tenant_id', json_object(
        'type', 'string',
        'description', 'Optional tenant context.'
      ),
      'user_id', json_object(
        'type', 'string',
        'description', 'Optional user context.'
      ),
      'workspace_id', json_object(
        'type', 'string',
        'description', 'Optional workspace context.'
      ),
      'session_id', json_object(
        'type', 'string',
        'description', 'Optional session context.'
      )
    ),
    'required', json_array('sql'),
    'additionalProperties', json('false')
  ),
  updated_at = unixepoch()
WHERE tool_name = 'd1_query';
