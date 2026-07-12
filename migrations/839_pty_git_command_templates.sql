-- 839: pty_git_* tools must carry command_template — git handler rewrites to terminal
-- and previously failed with "terminal tool requires command in input" when the model
-- correctly called pty_git_status with no command (empty input_schema).

UPDATE agentsam_tools
SET
  handler_config = json_object(
    'auth_source', 'workspace',
    'env_key', 'PTY_AUTH_TOKEN',
    'command_template', 'git status --short --branch'
  ),
  input_schema = json_object(
    'type', 'object',
    'properties', json_object(
      'path', json_object('type', 'string', 'description', 'Optional working directory')
    )
  ),
  description = COALESCE(
    NULLIF(trim(description), ''),
    'Show git status (branch + short porcelain) for the workspace repo root.'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'pty_git_status';

UPDATE agentsam_tools
SET
  handler_config = json_object(
    'auth_source', 'workspace',
    'env_key', 'PTY_AUTH_TOKEN',
    'command_template', 'git diff --stat'
  ),
  input_schema = json_object(
    'type', 'object',
    'properties', json_object(
      'path', json_object('type', 'string', 'description', 'Optional working directory')
    )
  ),
  description = COALESCE(
    NULLIF(trim(description), ''),
    'Show git diff --stat for the workspace repo root.'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'pty_git_diff';

UPDATE agentsam_tools
SET
  handler_config = json_object(
    'auth_source', 'workspace',
    'env_key', 'PTY_AUTH_TOKEN',
    'command_template', 'git log -20 --oneline --decorate'
  ),
  input_schema = json_object(
    'type', 'object',
    'properties', json_object(
      'path', json_object('type', 'string', 'description', 'Optional working directory')
    )
  ),
  description = COALESCE(
    NULLIF(trim(description), ''),
    'Show recent git log for the workspace repo root.'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'pty_git_log';
