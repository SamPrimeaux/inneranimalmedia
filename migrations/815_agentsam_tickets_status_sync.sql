-- 815: agentsam_tickets status sync + domain seeds (platform engineering only).
-- Collaborate client tasks are NOT seeded here — see plans/README.md domain boundary.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/815_agentsam_tickets_status_sync.sql

-- Mark completed image/library work as shipped
UPDATE agentsam_tickets
SET status = 'shipped',
    closed_at = COALESCE(closed_at, unixepoch()),
    updated_at = unixepoch()
WHERE id IN (
  'tkt_artifacts_library_css',
  'tkt_image_thompson_feedback',
  'tkt_image_save_project_org'
)
AND status != 'shipped';

-- Finding #3 blocks Phase B (explicit blocked status)
UPDATE agentsam_tickets
SET status = 'blocked',
    status_reason = 'Pending stubs must not use status=error; blocks Ledger ownership Phase B.',
    updated_at = unixepoch(),
    closed_at = NULL
WHERE id = 'tkt_finding_3_pending_status';

UPDATE agentsam_tickets
SET status = 'blocked',
    status_reason = 'Blocked on Finding #3: status=error used for pending stubs; fix status semantics before ownership skip-flag work.',
    blocked_by = '["tkt_finding_3_pending_status"]',
    updated_at = unixepoch(),
    closed_at = NULL
WHERE id = 'tkt_ledger_ownership_b';

-- Seed session-locked tickets (INSERT OR IGNORE)
INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, created_at, updated_at, closed_at
) VALUES
(
  'tkt_image_intent_regression',
  'Image-gen intent regression (prompt not executing)',
  'shipped',
  NULL,
  'inneranimalmedia',
  'image-gen',
  '["intent","qna-fast","photo"]',
  'P0',
  'plans/active/IMAGE-THOMPSON-FEEDBACK-COST-TIER.md',
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  unixepoch()
),
(
  'tkt_thumbs_icon_swap',
  'Thumbs icon swap on image generation cards',
  'shipped',
  NULL,
  'inneranimalmedia',
  'image-gen',
  '["ui","thumbs"]',
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
  'tkt_reward_events_tenant',
  'agentsam_reward_events — fix hardcoded tenant default, single-writer refactor',
  'backlog',
  NULL,
  'inneranimalmedia',
  'telemetry',
  '["reward","tenant"]',
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
  'tkt_work_shell_naming',
  'Work shell naming — Library→Work + Home source lanes',
  'shipped',
  NULL,
  'inneranimalmedia',
  'ui-library',
  '["artifacts","work","lanes"]',
  'P3',
  NULL,
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  unixepoch()
),
(
  'tkt_collaborate_ticket_drawer',
  'Collaborate ticket-drawer UI (client tasks — NOT agentsam_tickets)',
  'backlog',
  NULL,
  'inneranimalmedia',
  'collaborate',
  '["ui","deferred"]',
  'P3',
  NULL,
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
);

-- Ensure model attribution stays backlog behind TELEMETRY-002
UPDATE agentsam_tickets
SET status = 'backlog',
    blocked_by = '["tkt_telemetry_002"]',
    updated_at = unixepoch(),
    closed_at = NULL
WHERE id = 'tkt_model_attribution';

INSERT OR IGNORE INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
) VALUES
(
  'tke_815_intent_shipped',
  'tkt_image_intent_regression',
  'status_change',
  'active',
  'shipped',
  'Fixed photo noun intent + image fast path before chat compile',
  NULL,
  unixepoch()
),
(
  'tke_815_thumbs_shipped',
  'tkt_thumbs_icon_swap',
  'status_change',
  'active',
  'shipped',
  'Lucide ThumbsUp/ThumbsDown on AgentImageGenerationCard',
  NULL,
  unixepoch()
),
(
  'tke_815_domain_boundary',
  'tkt_collaborate_ticket_drawer',
  'note',
  NULL,
  NULL,
  'Collaborate = client/ops; agentsam_tickets = platform engineering. Do not merge.',
  NULL,
  unixepoch()
);
