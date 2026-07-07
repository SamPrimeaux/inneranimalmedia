-- 797: Google Calendar + Drive write MCP tools (full integration CRUD parity).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/797_google_integrations_crud_tools.sql

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name,
  handler_type, tool_category, handler_key, handler_config,
  description, input_schema,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_global, workspace_scope, oauth_visible, dispatch_target,
  sort_priority, updated_at
) VALUES
(
  'ast_gcal_list',
  'gcal_list', 'gcal_list', 'List Google Calendar Events',
  'platform', 'integrations', 'gcal_list',
  '{"operation":"gcal_list","auth_source":"workspace"}',
  'List events from the connected Google Calendar (primary) for the authenticated user.',
  '{"type":"object","properties":{"time_min":{"type":"string"},"time_max":{"type":"string"},"limit":{"type":"integer"},"calendar_id":{"type":"string"},"account":{"type":"string"}}}',
  'low', 0, 0, 1, 1, '["*"]', 1, 'both', 24, unixepoch()
),
(
  'ast_gcal_create',
  'gcal_create', 'gcal_create', 'Create Google Calendar Event',
  'platform', 'integrations', 'gcal_create',
  '{"operation":"gcal_create","auth_source":"workspace"}',
  'Create an event on Google Calendar (requires calendar.events OAuth scope).',
  '{"type":"object","properties":{"title":{"type":"string"},"start_datetime":{"type":"string"},"end_datetime":{"type":"string"},"description":{"type":"string"},"location":{"type":"string"},"timezone":{"type":"string"},"account":{"type":"string"}},"required":["title","start_datetime","end_datetime"]}',
  'medium', 0, 0, 1, 1, '["*"]', 1, 'both', 25, unixepoch()
),
(
  'ast_gcal_update',
  'gcal_update', 'gcal_update', 'Update Google Calendar Event',
  'platform', 'integrations', 'gcal_update',
  '{"operation":"gcal_update","auth_source":"workspace"}',
  'Patch a Google Calendar event by Google event id.',
  '{"type":"object","properties":{"event_id":{"type":"string"},"title":{"type":"string"},"start_datetime":{"type":"string"},"end_datetime":{"type":"string"},"description":{"type":"string"},"location":{"type":"string"},"timezone":{"type":"string"},"account":{"type":"string"}},"required":["event_id"]}',
  'medium', 0, 0, 1, 1, '["*"]', 1, 'both', 26, unixepoch()
),
(
  'ast_gcal_delete',
  'gcal_delete', 'gcal_delete', 'Delete Google Calendar Event',
  'platform', 'integrations', 'gcal_delete',
  '{"operation":"gcal_delete","auth_source":"workspace"}',
  'Delete a Google Calendar event by Google event id.',
  '{"type":"object","properties":{"event_id":{"type":"string"},"account":{"type":"string"}},"required":["event_id"]}',
  'high', 1, 0, 1, 1, '["*"]', 1, 'both', 27, unixepoch()
),
(
  'ast_gdrive_create_folder',
  'gdrive_create_folder', 'gdrive_create_folder', 'Create Drive Folder',
  'platform', 'integrations', 'gdrive_create_folder',
  '{"operation":"gdrive_create_folder","auth_source":"workspace"}',
  'Create a folder in Google Drive.',
  '{"type":"object","properties":{"name":{"type":"string"},"folder_id":{"type":"string","description":"Parent folder id (default root)"}},"required":["name"]}',
  'medium', 0, 0, 1, 1, '["*"]', 1, 'both', 28, unixepoch()
),
(
  'ast_gdrive_trash',
  'gdrive_trash', 'gdrive_trash', 'Trash Drive File',
  'platform', 'integrations', 'gdrive_trash',
  '{"operation":"gdrive_trash","auth_source":"workspace"}',
  'Move a Google Drive file or folder to trash.',
  '{"type":"object","properties":{"file_id":{"type":"string"}},"required":["file_id"]}',
  'high', 1, 0, 1, 1, '["*"]', 1, 'both', 29, unixepoch()
),
(
  'ast_gdrive_delete',
  'gdrive_delete', 'gdrive_delete', 'Delete Drive File',
  'platform', 'integrations', 'gdrive_delete',
  '{"operation":"gdrive_delete","auth_source":"workspace"}',
  'Permanently delete a Google Drive file (requires manage scope).',
  '{"type":"object","properties":{"file_id":{"type":"string"}},"required":["file_id"]}',
  'high', 1, 0, 1, 1, '["*"]', 1, 'both', 30, unixepoch()
),
(
  'ast_gdrive_rename',
  'gdrive_rename', 'gdrive_rename', 'Rename Drive File',
  'platform', 'integrations', 'gdrive_rename',
  '{"operation":"gdrive_rename","auth_source":"workspace"}',
  'Rename a Google Drive file or folder.',
  '{"type":"object","properties":{"file_id":{"type":"string"},"name":{"type":"string"}},"required":["file_id","name"]}',
  'medium', 0, 0, 1, 1, '["*"]', 1, 'both', 31, unixepoch()
);

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, notes, is_active, expose_on_connector, connector_priority, updated_at
) VALUES
  ('iam_mcp_inneranimalmedia', 'gcal_list', 'read', 24, '797: GCal list', 1, 1, 24, unixepoch()),
  ('iam_mcp_inneranimalmedia', 'gcal_create', 'write', 25, '797: GCal create', 1, 1, 25, unixepoch()),
  ('iam_mcp_inneranimalmedia', 'gcal_update', 'write', 26, '797: GCal update', 1, 1, 26, unixepoch()),
  ('iam_mcp_inneranimalmedia', 'gcal_delete', 'write', 27, '797: GCal delete', 1, 1, 27, unixepoch()),
  ('iam_mcp_inneranimalmedia', 'gdrive_create_folder', 'write', 28, '797: Drive folder', 1, 1, 28, unixepoch()),
  ('iam_mcp_inneranimalmedia', 'gdrive_trash', 'write', 29, '797: Drive trash', 1, 1, 29, unixepoch()),
  ('iam_mcp_inneranimalmedia', 'gdrive_delete', 'write', 30, '797: Drive delete', 1, 1, 30, unixepoch()),
  ('iam_mcp_inneranimalmedia', 'gdrive_rename', 'write', 31, '797: Drive rename', 1, 1, 31, unixepoch());

INSERT OR IGNORE INTO agentsam_capability_aliases (
  abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active
) VALUES
  ('calendar.list', 'tool_key', 'gcal_list', 'integrate', 10, 0, 0, '797: Google Calendar list', 1),
  ('calendar.create', 'tool_key', 'gcal_create', 'integrate', 10, 0, 1, '797: Google Calendar create', 1),
  ('calendar.update', 'tool_key', 'gcal_update', 'integrate', 10, 0, 1, '797: Google Calendar update', 1),
  ('calendar.delete', 'tool_key', 'gcal_delete', 'integrate', 10, 1, 1, '797: Google Calendar delete', 1),
  ('drive.create', 'tool_key', 'gdrive_create_folder', 'integrate', 10, 0, 1, '797: Drive folder create', 1),
  ('drive.delete', 'tool_key', 'gdrive_trash', 'integrate', 10, 1, 1, '797: Drive trash', 1),
  ('drive.delete', 'tool_key', 'gdrive_delete', 'integrate', 20, 1, 1, '797: Drive permanent delete', 1),
  ('drive.update', 'tool_key', 'gdrive_rename', 'integrate', 10, 0, 1, '797: Drive rename', 1)
ON CONFLICT (abstract_capability, match_kind, match_value) DO UPDATE SET
  is_active = 1,
  updated_at = datetime('now');
