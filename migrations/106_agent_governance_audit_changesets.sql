-- 106: Agent governance, audit log, and change sets (Agent Sam Workstation)
-- Database: inneranimalmedia-business (D1)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --file=./migrations/106_agent_governance_audit_changesets.sql
-- Purpose: Deny-by-default roles/capabilities, user_governance_roles, agent_command_audit_log, change_sets/change_set_items.

-- Governance roles (minimal)
CREATE TABLE IF NOT EXISTS governance_roles (
  role_id TEXT PRIMARY KEY,
  role_name TEXT NOT NULL,
  description TEXT
);

-- Governance capabilities (key + risk)
CREATE TABLE IF NOT EXISTS governance_capabilities (
  capability_id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  risk_level TEXT NOT NULL DEFAULT 'medium'
);

-- Role ↔ capability
CREATE TABLE IF NOT EXISTS role_capabilities (
  role_id TEXT NOT NULL REFERENCES governance_roles(role_id),
  capability_key TEXT NOT NULL,
  PRIMARY KEY (role_id, capability_key)
);

-- User → role (workspace/tenant scoped; '' = all)
CREATE TABLE IF NOT EXISTS user_governance_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES governance_roles(role_id),
  workspace_id TEXT NOT NULL DEFAULT '',
  tenant_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, role_id, workspace_id, tenant_id)
);

-- Audit log for every tool/command run
CREATE TABLE IF NOT EXISTS agent_command_audit_log (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  user_id TEXT,
  workspace_id TEXT,
  tenant_id TEXT,
  command_key TEXT NOT NULL,
  target TEXT,
  result TEXT NOT NULL,
  result_json TEXT,
  cost REAL,
  error_text TEXT,
  request_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_command_audit_log_user ON agent_command_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_command_audit_log_command ON agent_command_audit_log(command_key);
CREATE INDEX IF NOT EXISTS idx_agent_command_audit_log_timestamp ON agent_command_audit_log(timestamp DESC);

-- Staged write sets
CREATE TABLE IF NOT EXISTS change_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  tenant_id TEXT,
  conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS change_set_items (
  id TEXT PRIMARY KEY,
  change_set_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  args_json TEXT NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 1,
  result_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  applied_at INTEGER,
  FOREIGN KEY (change_set_id) REFERENCES change_sets(id)
);
CREATE INDEX IF NOT EXISTS idx_change_set_items_set ON change_set_items(change_set_id);

-- Seed default roles
INSERT OR IGNORE INTO governance_roles (role_id, role_name, description) VALUES
  ('OWNER_ADMIN', 'Owner / Admin', 'Full access: all capabilities'),
  ('READ_ONLY', 'Read only', 'Read-only access: D1_QUERY, R2_READ, AGENT_CHAT; no writes or deploy');

-- Seed capabilities
INSERT OR IGNORE INTO governance_capabilities (capability_id, key, description, risk_level) VALUES
  ('cap_r2_read', 'R2_READ', 'List and read R2 objects', 'low'),
  ('cap_r2_write_staged', 'R2_WRITE_STAGED', 'Propose R2 writes (staged)', 'medium'),
  ('cap_r2_write', 'R2_WRITE', 'Direct R2 write', 'high'),
  ('cap_d1_query', 'D1_QUERY', 'Run read-only D1 queries', 'low'),
  ('cap_d1_write', 'D1_WRITE', 'Run D1 writes', 'high'),
  ('cap_d1_migrate', 'D1_MIGRATE_STAGED', 'Propose D1 migrations', 'high'),
  ('cap_deploy', 'DEPLOY', 'Deploy workers / run deploy flows', 'critical'),
  ('cap_agent_chat', 'AGENT_CHAT', 'Use agent chat', 'low'),
  ('cap_agent_image', 'AGENT_IMAGE', 'Generate images', 'medium'),
  ('cap_secrets_read', 'SECRETS_READ', 'Read secret names (not values)', 'medium');

-- OWNER_ADMIN gets all capabilities
INSERT OR IGNORE INTO role_capabilities (role_id, capability_key)
  SELECT 'OWNER_ADMIN', key FROM governance_capabilities;

-- READ_ONLY gets read-only + chat
INSERT OR IGNORE INTO role_capabilities (role_id, capability_key) VALUES
  ('READ_ONLY', 'R2_READ'),
  ('READ_ONLY', 'D1_QUERY'),
  ('READ_ONLY', 'AGENT_CHAT');

-- Optional: extend agent_commands (run after confirming columns do not exist)
-- ALTER TABLE agent_commands ADD COLUMN command_key TEXT UNIQUE;
-- ALTER TABLE agent_commands ADD COLUMN required_capability_key TEXT;
-- ALTER TABLE agent_commands ADD COLUMN handler TEXT;
-- ALTER TABLE agent_commands ADD COLUMN validation_schema_json TEXT;

-- Optional: extend mcp_services (run after confirming columns do not exist)
-- ALTER TABLE mcp_services ADD COLUMN service_key TEXT UNIQUE;
-- ALTER TABLE mcp_services ADD COLUMN allowed_commands TEXT;
