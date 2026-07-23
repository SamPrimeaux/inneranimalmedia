-- 1004: Name the three E2E verification tiers on the existing dual-pass law.
-- Default remains required_pass_count=2 (Tier 1+2). Control-plane tickets use 3.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/1004_ticket_e2e_three_tier_law.sql

UPDATE agentsam_rules_document
SET
  title = 'LOCKED: Named E2E tiers before ticket shipped (default 2; control-plane 3)',
  body_markdown = '## Ticket E2E tiers (LOCKED)

Never set agentsam_tickets.status = shipped after a single proof, visual glance, or deploy-only.

### Tiers (same record/assert scripts)
1. **Tier 1 — Implementation** (fix author): live exercise + durable proof IDs. Hypothesis until Tier 2.
2. **Tier 2 — Independent verification** (different actor): raw D1/log pull, not the implementer summary. May say not verified yet.
3. **Tier 3 — Durable enforcement** (gate / subsequent real run): path fails itself after humans stop watching (deploy-trail-gate, routing gate, assert).

### Counts
- Default required_pass_count = 2 (Tier 1 + Tier 2) for product tickets.
- Control-plane / deploy-trail / identity / ledger tickets: required_pass_count = 3.
- Deploy success is not a pass. Cross-session: re-check from raw data, never prior chat memory.

### Commands
- npm run record:ticket-e2e-pass -- --ticket=tkt_… --tier=1 --detail=''…''
- npm run record:ticket-e2e-pass -- --ticket=tkt_… --tier=2 --detail=''…''
- npm run record:ticket-e2e-pass -- --ticket=tkt_… --tier=3 --detail=''…''
- npm run assert:ticket-shippable -- --ticket=tkt_… --set-shipped

### Cursor
.cursor/rules/iam-ticket-dual-pass-e2e.mdc (alwaysApply)
plans/active/README.md Verification law',
  version = COALESCE(version, 0) + 1,
  updated_at_epoch = unixepoch(),
  notes = '2026-07-22: Named three-tier verification (implement → independent raw pull → durable gate). Extends dual-pass; does not invent new infra.',
  source_stored = 'migrations/1004_ticket_e2e_three_tier_law.sql'
WHERE id = 'rule_ticket_dual_pass_e2e' OR rule_key = 'rule_ticket_dual_pass_e2e';

UPDATE agentsam_tickets
SET
  status_reason = 'LOCKED: named E2E tiers — default required_pass_count=2 (T1+T2); control-plane=3. record:ticket-e2e-pass --tier=N + assert:ticket-shippable. See rule_ticket_dual_pass_e2e.',
  updated_at = unixepoch()
WHERE id = 'tkt_phase_gate_stop';

INSERT INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
) VALUES (
  'tevt_e2e_tiers_' || lower(hex(randomblob(4))),
  'tkt_phase_gate_stop',
  'note',
  NULL,
  NULL,
  '2026-07-22: Dual-pass law extended to named tiers (T1 implement, T2 independent raw pull, T3 durable gate). Default count still 2; control-plane tickets use 3.',
  NULL,
  unixepoch()
);
