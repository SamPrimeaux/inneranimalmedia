-- 817: Honest ticket sync after reward single-writer + audit (2026-07-11).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/817_ticket_audit_reward_single_writer.sql

-- Intent keywords + classifier escalate shipped (7206beb9) — keep active until revision retest + decision-log proof
UPDATE agentsam_tickets
SET status = 'in_review',
    title = 'Image intent — D1 keywords + classifier escalate (verify decision log + same-thread revision)',
    updated_at = unixepoch()
WHERE id = 'tkt_intent_keywords_classifier';

-- Reward events: table existed but was a 5th parallel writer; single-writer batch is the real fix
UPDATE agentsam_tickets
SET status = 'active',
    title = 'agentsam_reward_events — single-writer applyRewardEvent (batch event+arm, incl cost_mean)',
    priority = 'P1',
    updated_at = unixepoch(),
    closed_at = NULL
WHERE id = 'tkt_reward_events_tenant';

-- Content tier / cost on draft: write paths exist; confirm via D1 after next gens (in_review)
UPDATE agentsam_tickets
SET status = 'in_review',
    updated_at = unixepoch()
WHERE id IN ('tkt_telemetry_002', 'tkt_image_thompson_feedback');

INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, created_at, updated_at, closed_at
) VALUES
(
  'tkt_arm_cost_mean_loop',
  'Close cost→bandit loop — cost_mean via applyRewardEvent on image outcomes',
  'active',
  NULL,
  'inneranimalmedia',
  'telemetry',
  '["thompson","cost_mean","single-writer"]',
  'P1',
  'plans/active/INTENT-KEYWORDS-CLASSIFIER-REWARD-EVENTS.md',
  '[]',
  '["tkt_reward_events_tenant"]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
),
(
  'tkt_thompson_cost_latency_bias',
  'Bias Thompson sampling by latency + cost (not success-only Beta)',
  'backlog',
  NULL,
  'inneranimalmedia',
  'routing',
  '["thompson","cost","latency"]',
  'P2',
  NULL,
  '[]',
  '["tkt_arm_cost_mean_loop"]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
),
(
  'tkt_per_content_tier_arms',
  'Per-content-tier Thompson arms (mockup vs presentation not one alpha/beta)',
  'backlog',
  NULL,
  'inneranimalmedia',
  'image-gen',
  '["thompson","content_tier"]',
  'P2',
  NULL,
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
),
(
  'tkt_image_revision_followup',
  'Image revision/follow-up in same thread — deliberate retest (do not close on noun-list fix alone)',
  'active',
  NULL,
  'inneranimalmedia',
  'image-gen',
  '["intent","revision","retest"]',
  'P1',
  NULL,
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
),
(
  'tkt_flux_thompson_limbo',
  'Flux (@cf/black-forest-labs/flux-*) — decide: add to live Thompson pool or document exclusion',
  'backlog',
  NULL,
  'inneranimalmedia',
  'image-gen',
  '["flux","thompson"]',
  'P3',
  NULL,
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
),
(
  'tkt_consolidate_arm_writers',
  'Enumerate remaining UPDATE agentsam_routing_arms success_alpha writers; migrate to applyRewardEvent',
  'backlog',
  NULL,
  'inneranimalmedia',
  'telemetry',
  '["single-writer","ledger"]',
  'P2',
  NULL,
  '[]',
  '["tkt_reward_events_tenant"]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
);

-- Work Tickets UI shipped (11771605) — mark collaborate drawer still backlog
UPDATE agentsam_tickets
SET status = 'shipped',
    closed_at = COALESCE(closed_at, unixepoch()),
    updated_at = unixepoch(),
    title = 'Work shell — Library→Work, Home lanes, platform Tickets rail'
WHERE id = 'tkt_work_shell_naming';

INSERT OR IGNORE INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
) VALUES
(
  'tke_817_fifth_writer',
  'tkt_reward_events_tenant',
  'note',
  NULL,
  NULL,
  '7206beb9 shipped table as 5th parallel writer; correct shape is applyRewardEvent D1 batch (event+arm). Domain tables may record facts; only applyRewardEvent mutates bandit columns for image lane.',
  NULL,
  unixepoch()
);
