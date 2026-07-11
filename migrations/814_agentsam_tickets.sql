-- 814: agentsam_tickets — D1 index over plans/*.md (prose SSOT via doc_path).
-- Does NOT replace kanban / agentsam_todo / project_issues.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/814_agentsam_tickets.sql

CREATE TABLE IF NOT EXISTS agentsam_tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('backlog', 'active', 'blocked', 'in_review', 'shipped', 'abandoned')),
  status_reason TEXT,
  project TEXT,
  subsystem TEXT,
  tags TEXT,
  priority TEXT,
  doc_path TEXT,
  blocks TEXT,
  blocked_by TEXT,
  supersedes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agentsam_tickets_status_priority
  ON agentsam_tickets(status, priority);
CREATE INDEX IF NOT EXISTS idx_agentsam_tickets_project
  ON agentsam_tickets(project);
CREATE INDEX IF NOT EXISTS idx_agentsam_tickets_subsystem
  ON agentsam_tickets(subsystem);
CREATE INDEX IF NOT EXISTS idx_agentsam_tickets_doc_path
  ON agentsam_tickets(doc_path);

CREATE TABLE IF NOT EXISTS agentsam_ticket_events (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  detail TEXT,
  commit_sha TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agentsam_ticket_events_ticket
  ON agentsam_ticket_events(ticket_id, created_at);

-- Seed current open work (INSERT OR IGNORE). Body lives in doc_path markdown.
INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, created_at, updated_at, closed_at
) VALUES
(
  'tkt_telemetry_001',
  'TELEMETRY-001 tool cost ledger SSOT',
  'shipped',
  NULL,
  'iam-core',
  'telemetry',
  '["ledger","ssot"]',
  'P0',
  'plans/active/TELEMETRY-001-tool-cost-ledger-ssot.md',
  '["tkt_telemetry_002"]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  unixepoch()
),
(
  'tkt_telemetry_002',
  'TELEMETRY-002 paid tool usage cost',
  'active',
  NULL,
  'iam-core',
  'telemetry',
  '["cost","image-gen"]',
  'P0',
  'plans/active/TELEMETRY-002-paid-tool-usage-cost.md',
  '[]',
  '["tkt_telemetry_001"]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
),
(
  'tkt_ledger_ownership_b',
  'Ledger ownership Phase B — pending vs error status',
  'blocked',
  'Blocked on Finding #3: status=error used for pending stubs; fix status semantics before ownership skip-flag work.',
  'iam-core',
  'ledger',
  '["mcp_proxy","finding-3"]',
  'P1',
  'plans/backlog/TELEMETRY-LEDGER-OWNERSHIP-mcp-exec-mirror.md',
  '[]',
  '["tkt_finding_3_pending_status"]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
),
(
  'tkt_finding_3_pending_status',
  'Finding #3 — pending stubs must not use status=error',
  'active',
  NULL,
  'iam-core',
  'ledger',
  '["status-enum","tool_call_log"]',
  'P0',
  'plans/backlog/TELEMETRY-LEDGER-OWNERSHIP-mcp-exec-mirror.md',
  '["tkt_ledger_ownership_b"]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
),
(
  'tkt_model_attribution',
  'Model attribution on tool_call_log',
  'backlog',
  NULL,
  'iam-core',
  'telemetry',
  '["routing_arm","fallback"]',
  'P2',
  'plans/backlog/TELEMETRY-MODEL-ATTRIBUTION-tool-call-log.md',
  '[]',
  '["tkt_telemetry_002"]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
),
(
  'tkt_image_thompson_feedback',
  'Image Thompson — cost, content tier, thumbs',
  'shipped',
  NULL,
  'iam-core',
  'image-gen',
  '["thompson","feedback"]',
  'P1',
  'plans/active/IMAGE-THOMPSON-FEEDBACK-COST-TIER.md',
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  unixepoch()
),
(
  'tkt_image_save_project_org',
  'Image save path + project/tag organization API',
  'active',
  NULL,
  'iam-core',
  'image-gen',
  '["save","project_id","tags"]',
  'P1',
  'plans/active/IMAGE-THOMPSON-FEEDBACK-COST-TIER.md',
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
),
(
  'tkt_artifacts_library_css',
  'Repair /dashboard/artifacts after library.css wipe',
  'active',
  NULL,
  'iam-core',
  'ui-library',
  '["artifacts","css"]',
  'P0',
  NULL,
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
);

INSERT OR IGNORE INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
) VALUES
(
  'tke_seed_telemetry_001',
  'tkt_telemetry_001',
  'status_change',
  NULL,
  'shipped',
  'Seeded as shipped after TELEMETRY-001 delivery',
  NULL,
  unixepoch()
),
(
  'tke_seed_finding_3',
  'tkt_finding_3_pending_status',
  'note',
  NULL,
  NULL,
  'Blocks Phase B ledger ownership until pending vs error semantics are fixed',
  NULL,
  unixepoch()
);
