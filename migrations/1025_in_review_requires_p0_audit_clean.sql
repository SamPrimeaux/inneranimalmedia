-- 1025: in_review requires audit:p0-closeout clean + recorded T1 (extends dual-pass law).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/1025_in_review_requires_p0_audit_clean.sql

UPDATE agentsam_rules_document
SET
  title = 'LOCKED: Named E2E tiers + in_review audit gate (default 2; control-plane 3)',
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

### in_review gate (LOCKED — 2026-07-24)
Do **not** flip status to in_review on vibes.
1. Run `npm run audit:p0-closeout -- --ticket=tkt_…` (or cluster).
2. Verdict must not be CONFLICT or MISSING_ROW.
3. Record Tier 1 in the same change set when claiming in_review:
   `npm run record:ticket-e2e-pass -- --ticket=tkt_… --tier=1 --detail=''…'' --status=in_review`
4. in_review with consecutive_pass_count=0 and zero e2e_pass events is drift — downgrade to active with status_reason.

### Commands
- npm run audit:p0-closeout
- npm run audit:p0-closeout:all
- npm run record:ticket-e2e-pass -- --ticket=tkt_… --tier=1|2|3 --detail=''…''
- npm run assert:ticket-shippable -- --ticket=tkt_… --set-shipped

### Cursor
.cursor/rules/iam-ticket-dual-pass-e2e.mdc (alwaysApply)
plans/active/README.md Verification law
scripts/audit_p0_in_review_closeout.py',
  version = COALESCE(version, 0) + 1,
  updated_at_epoch = unixepoch(),
  notes = '2026-07-24: in_review requires audit:p0-closeout clean + T1 recorded; closes in_review-with-zero-proof drift.',
  source_stored = 'migrations/1025_in_review_requires_p0_audit_clean.sql'
WHERE id = 'rule_ticket_dual_pass_e2e' OR rule_key = 'rule_ticket_dual_pass_e2e';

UPDATE agentsam_tickets
SET
  status_reason = 'LOCKED: named E2E tiers (T1+T2 default; control-plane T3) + in_review requires npm run audit:p0-closeout clean and recorded T1. See rule_ticket_dual_pass_e2e.',
  updated_at = unixepoch()
WHERE id = 'tkt_phase_gate_stop';

INSERT INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
) VALUES (
  'tevt_inrev_audit_' || lower(hex(randomblob(4))),
  'tkt_phase_gate_stop',
  'note',
  NULL,
  NULL,
  '2026-07-24: Standing rule — cannot move to in_review without audit:p0-closeout clean (no CONFLICT/MISSING_ROW) and Tier-1 e2e_pass recorded. Prevents zero-proof in_review drift.',
  NULL,
  unixepoch()
);
