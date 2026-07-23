-- 1001: Ticket for fs_write HTML tool-args truncation / parse repair.
INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, created_at, updated_at, closed_at,
  consecutive_pass_count, required_pass_count
) VALUES (
  'tkt_fs_write_html_args_parse',
  'P0: fs_write_file tool_arguments_json_parse_error on HTML (truncated JSON repair)',
  'active',
  'HTML/CSS bodies truncated mid-tool-call JSON; repairTruncatedJson + never clobber longer args',
  'inneranimalmedia',
  'agent_tools',
  '["p0","fs_write","json_parse","html"]',
  'P0',
  'plans/active/AGENTSAM-FILE-CREATE-HTML-FAILURES-2026-07-22.md',
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL,
  0,
  2
);

INSERT INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
) VALUES (
  'tev_fs_write_html_args_' || lower(hex(randomblob(4))),
  'tkt_fs_write_html_args_parse',
  'opened',
  NULL,
  'active',
  'D1 proof: 4x tool_arguments_json_parse_error on HTML writes; raw unterminated at truncate — not quote escaping',
  NULL,
  unixepoch()
);
