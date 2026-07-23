-- 1000: Split hydrate-scope ticket from media-rank; open P0 tool-error visible-text ticket.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/1000_tool_error_visible_and_hydrate_scope_tickets.sql

INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, created_at, updated_at, closed_at,
  consecutive_pass_count, required_pass_count
) VALUES
(
  'tkt_tool_error_visible_text',
  'P0: never surface raw tool_error/timeout as assistant SSE text',
  'active',
  'Raw strings like "Tool timed out after 1341ms" must go through synthesizeUserVisibleAgentFailure before text/error bubbles',
  'inneranimalmedia',
  'agent_chat',
  '["p0","sse","tool_error","ux"]',
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
),
(
  'tkt_search_tools_hydrate_scope_by_intent',
  'Progressive hydrate: scope GitHub write/PR/tree (and heavy tools) by intent on fast lane',
  'active',
  'Split from media-rank: vague conversational questions must not hydrate agentsam_github_create_pr / tree / write tools',
  'inneranimalmedia',
  'progressive_tools',
  '["hydrate","search_tools","github","fast_lane"]',
  'P1',
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

UPDATE agentsam_tickets
SET status_reason = 'Media-only: imgx_/veo_ ranking. Broader GitHub/heavy hydrate → tkt_search_tools_hydrate_scope_by_intent',
    updated_at = unixepoch()
WHERE id = 'tkt_search_tools_rank_media_last';

INSERT INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
) VALUES
(
  'tev_tool_error_visible_opened_' || lower(hex(randomblob(4))),
  'tkt_tool_error_visible_text',
  'opened',
  NULL,
  'active',
  'Opened as P0 separate from hydrate ranking — raw tool_timeout must never be assistant text',
  NULL,
  unixepoch()
),
(
  'tev_hydrate_scope_opened_' || lower(hex(randomblob(4))),
  'tkt_search_tools_hydrate_scope_by_intent',
  'opened',
  NULL,
  'active',
  'Split from tkt_search_tools_rank_media_last — GitHub write/PR/tree hydrate for vague fast-lane questions',
  NULL,
  unixepoch()
);
