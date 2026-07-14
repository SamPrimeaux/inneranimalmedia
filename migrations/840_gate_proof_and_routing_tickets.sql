-- 840: Gate proof ledger + ticket columns so "shipped" requires repeated green gates
-- Apply carefully: ADD COLUMN fails if already present — apply CREATE + seeds; ALTERs one-by-one if needed.
--   npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/840_gate_proof_and_routing_tickets.sql

CREATE TABLE IF NOT EXISTS agentsam_gate_runs (
  id TEXT PRIMARY KEY,
  gate_key TEXT NOT NULL,
  ticket_id TEXT,
  git_sha TEXT,
  ok INTEGER NOT NULL DEFAULT 0,
  rounds_json TEXT,
  receipt_path TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_gate_runs_ticket
  ON agentsam_gate_runs(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agentsam_gate_runs_key
  ON agentsam_gate_runs(gate_key, created_at DESC);

-- Optional (skip if already applied):
-- ALTER TABLE agentsam_tickets ADD COLUMN consecutive_pass_count INTEGER DEFAULT 0;
-- ALTER TABLE agentsam_tickets ADD COLUMN last_gate_run_id TEXT;
-- ALTER TABLE agentsam_tickets ADD COLUMN last_gate_ok_at INTEGER;
-- ALTER TABLE agentsam_tickets ADD COLUMN required_pass_count INTEGER DEFAULT 2;

INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, created_at, updated_at, closed_at,
  consecutive_pass_count, required_pass_count
) VALUES
(
  'tkt_routing_tool_ssot',
  'ROUTING-TOOL-SSOT — D1 tool profiles + gate harness (no JS pin whack-a-mole)',
  'active',
  'Phase 0 gate harness; ship only after consecutive_pass_count >= required_pass_count with code/log proof',
  'inneranimalmedia',
  'routing',
  '["routing","tools","ssot","gate"]',
  'P0',
  'plans/active/ROUTING-TOOL-SSOT-E2E.md',
  '["tkt_workspace_001"]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL,
  0,
  2
),
(
  'tkt_routing_spine_front_door',
  'ROUTING-SPINE one front-door — TaskSpec + golden matrix',
  'in_review',
  'Spine shipped slice exists; still requires gate green x2 before shipped',
  'inneranimalmedia',
  'routing',
  '["routing","spine","taskspec"]',
  'P0',
  'plans/active/ROUTING-SPINE-ONE-FRONT-DOOR.md',
  '[]',
  '["tkt_routing_tool_ssot"]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL,
  0,
  2
),
(
  'tkt_workspace_001',
  'WORKSPACE-001 Agent Sam repository edit loop',
  'active',
  'Blocked on stable tool/profile SSOT (tkt_routing_tool_ssot)',
  'inneranimalmedia',
  'workspace',
  '["workspace","editor","fs"]',
  'P0',
  'plans/active/WORKSPACE-001-agent-repo-edit-loop.md',
  '[]',
  '["tkt_routing_tool_ssot"]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL,
  0,
  2
),
(
  'tkt_cms_001',
  'CMS-001 edit + publish inneranimalmedia home',
  'backlog',
  NULL,
  'inneranimalmedia',
  'cms',
  '["cms","publish"]',
  'P1',
  'plans/active/CMS-001-edit-publish-inneranimalmedia-home.md',
  '[]',
  '["tkt_workspace_001"]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL,
  0,
  2
),
(
  'tkt_designstudio_001',
  'DESIGNSTUDIO-001 Sam Sketch persistent artifact',
  'backlog',
  NULL,
  'inneranimalmedia',
  'designstudio',
  '["design","sketch"]',
  'P1',
  'plans/active/DESIGNSTUDIO-001-sam-sketch-persistent-artifact.md',
  '[]',
  '["tkt_cms_001"]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL,
  0,
  2
);

UPDATE agentsam_tickets
SET
  required_pass_count = COALESCE(required_pass_count, 2),
  consecutive_pass_count = COALESCE(consecutive_pass_count, 0),
  updated_at = unixepoch()
WHERE id IN (
  'tkt_routing_tool_ssot',
  'tkt_routing_spine_front_door',
  'tkt_workspace_001',
  'tkt_cms_001',
  'tkt_designstudio_001'
);

INSERT OR IGNORE INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
) VALUES (
  'tev_840_routing_ssot_seed',
  'tkt_routing_tool_ssot',
  'created',
  NULL,
  'active',
  '{"source":"migration_840","note":"Gate harness + proof counters; deploy alone cannot ship"}',
  NULL,
  unixepoch()
);
