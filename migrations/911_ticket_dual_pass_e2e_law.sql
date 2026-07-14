-- 911: Ticket dual-pass E2E law — two validated end-to-end proofs before shipped.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/911_ticket_dual_pass_e2e_law.sql

INSERT OR IGNORE INTO agentsam_rules_document (
  id,
  rule_key,
  user_id,
  workspace_id,
  title,
  body_markdown,
  version,
  is_active,
  created_at_epoch,
  updated_at_epoch,
  apply_mode,
  rule_type,
  trigger_type,
  sort_order,
  notes,
  source_stored
) VALUES (
  'rule_ticket_dual_pass_e2e',
  'rule_ticket_dual_pass_e2e',
  '',
  'ws_inneranimalmedia',
  'LOCKED: Two end-to-end validated passes before ticket shipped',
  '## Ticket dual-pass E2E (LOCKED)

Never set agentsam_tickets.status = shipped after a single proof, visual glance, or deploy-only.

### Law
1. required_pass_count defaults to 2.
2. Two separate end-to-end validations, at different times, each with durable proof IDs in D1 (intent decisions, tool_call_log, drafts, deploy events, gate runs, etc.).
3. Deploy success is not a pass.
4. After pass #1: record event_type=e2e_pass, leave in_review/active. After pass #2: assert:ticket-shippable --set-shipped.

### Commands
- npm run record:ticket-e2e-pass -- --ticket=tkt_… --detail=''PASS1: …''
- npm run record:ticket-e2e-pass -- --ticket=tkt_… --detail=''PASS2: …''
- npm run assert:ticket-shippable -- --ticket=tkt_… --set-shipped

### Cursor
.cursor/rules/iam-ticket-dual-pass-e2e.mdc (alwaysApply)
plans/active/README.md Verification law',
  1,
  1,
  unixepoch(),
  unixepoch(),
  'always',
  'platform',
  'always',
  25,
  'Enforced 2026-07-14 after image revision single-pass ship without ticket event ledger.',
  'migrations/911_ticket_dual_pass_e2e_law.sql'
);

-- Ensure open / in-flight tickets require at least two passes.
UPDATE agentsam_tickets
SET required_pass_count = 2,
    updated_at = unixepoch()
WHERE status IN ('backlog', 'active', 'blocked', 'in_review')
  AND (required_pass_count IS NULL OR required_pass_count < 2);

UPDATE agentsam_tickets
SET title = 'Standing rule: dual-pass E2E + phase checkpoints — never ship after one proof',
    status_reason = 'LOCKED: consecutive_pass_count >= required_pass_count (default 2) with agentsam_ticket_events.event_type=e2e_pass or agentsam_gate_runs. Use record:ticket-e2e-pass + assert:ticket-shippable. See rule_ticket_dual_pass_e2e.',
    required_pass_count = 2,
    doc_path = 'plans/active/README.md',
    tags = '["process","e2e","dual-pass","gate"]',
    updated_at = unixepoch()
WHERE id = 'tkt_phase_gate_stop';

INSERT INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
) VALUES (
  'tevt_dual_pass_law_' || lower(hex(randomblob(4))),
  'tkt_phase_gate_stop',
  'note',
  NULL,
  NULL,
  '2026-07-14: Documented + enforced dual-pass E2E law (rule_ticket_dual_pass_e2e, Cursor iam-ticket-dual-pass-e2e.mdc, assert/record scripts).',
  NULL,
  unixepoch()
);
