-- 931: Deferred lower-priority challenge for the in-app Design Studio agent.

INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, dedup_key, required_pass_count,
  created_at, updated_at, closed_at
) VALUES (
  'tkt_designstudio_005',
  'DESIGNSTUDIO-005 Repair eight Meshy catalog handler configs',
  'backlog',
  'Deferred lower-quality Meshy lane. Eight implemented media handlers are excluded because active agentsam_tools rows use handler_type=ai with empty handler_config. Repair registry dispatch without expanding Meshy product scope; require two authenticated E2E passes.',
  'inneranimalmedia',
  'designstudio',
  '["design","meshy","tool-catalog","handler-config","routing","byok","agent-challenge"]',
  'P1',
  NULL,
  '[]',
  '[]',
  NULL,
  'designstudio-005-meshy-handler-config-repair',
  2,
  unixepoch(),
  unixepoch(),
  NULL
);
