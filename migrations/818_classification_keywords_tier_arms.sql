-- 818: Unified classification keywords + per-tier image arms + ticket actor/analytics support.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/818_classification_keywords_tier_arms.sql

-- ── Unified classification keywords (intent + tier) ───────────────────────────
CREATE TABLE IF NOT EXISTS agentsam_classification_keywords (
  id          TEXT PRIMARY KEY,
  purpose     TEXT NOT NULL,   -- image_intent_noun | image_intent_verb | image_intent_escalate | image_tier_draft | image_tier_quality
  pattern     TEXT NOT NULL,
  label       TEXT,            -- optional human label / content_tier hint
  active      INTEGER NOT NULL DEFAULT 1,
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_class_kw_unique
  ON agentsam_classification_keywords(purpose, pattern);
CREATE INDEX IF NOT EXISTS idx_class_kw_purpose
  ON agentsam_classification_keywords(purpose, active);

-- Migrate existing intent keywords
INSERT OR IGNORE INTO agentsam_classification_keywords (id, purpose, pattern, label, active, notes, created_at, updated_at)
SELECT
  'ck_' || id,
  CASE keyword_type
    WHEN 'noun' THEN 'image_intent_noun'
    WHEN 'verb' THEN 'image_intent_verb'
    WHEN 'escalate_hint' THEN 'image_intent_escalate'
    ELSE 'image_intent_noun'
  END,
  pattern,
  task_type,
  active,
  notes,
  created_at,
  updated_at
FROM agentsam_intent_keywords
WHERE task_type = 'image_generation';

-- Tier keywords (draft → draft_mockup, quality → presentation_quality; else standard)
INSERT OR IGNORE INTO agentsam_classification_keywords (id, purpose, pattern, label, active, notes) VALUES
('ck_tier_d_draft', 'image_tier_draft', 'draft', 'draft_mockup', 1, NULL),
('ck_tier_d_rough', 'image_tier_draft', 'rough', 'draft_mockup', 1, NULL),
('ck_tier_d_quick', 'image_tier_draft', 'quick', 'draft_mockup', 1, NULL),
('ck_tier_d_sketch', 'image_tier_draft', 'sketch', 'draft_mockup', 1, NULL),
('ck_tier_d_blueprint', 'image_tier_draft', 'blueprint', 'draft_mockup', 1, NULL),
('ck_tier_d_floor_plan', 'image_tier_draft', 'floor plan', 'draft_mockup', 1, NULL),
('ck_tier_d_house_plan', 'image_tier_draft', 'house plan', 'draft_mockup', 1, NULL),
('ck_tier_d_site_plan', 'image_tier_draft', 'site plan', 'draft_mockup', 1, NULL),
('ck_tier_d_wireframe', 'image_tier_draft', 'wireframe', 'draft_mockup', 1, NULL),
('ck_tier_d_layout', 'image_tier_draft', 'layout', 'draft_mockup', 1, NULL),
('ck_tier_d_mood_board', 'image_tier_draft', 'mood board', 'draft_mockup', 1, NULL),
('ck_tier_d_moodboard', 'image_tier_draft', 'moodboard', 'draft_mockup', 1, NULL),
('ck_tier_d_concept_board', 'image_tier_draft', 'concept board', 'draft_mockup', 1, NULL),
('ck_tier_d_elevation_study', 'image_tier_draft', 'elevation study', 'draft_mockup', 1, NULL),
('ck_tier_q_presentation', 'image_tier_quality', 'presentation', 'presentation_quality', 1, NULL),
('ck_tier_q_client', 'image_tier_quality', 'client', 'presentation_quality', 1, NULL),
('ck_tier_q_final', 'image_tier_quality', 'final', 'presentation_quality', 1, NULL),
('ck_tier_q_high_res', 'image_tier_quality', 'high-res', 'presentation_quality', 1, NULL),
('ck_tier_q_highres', 'image_tier_quality', 'high res', 'presentation_quality', 1, NULL),
('ck_tier_q_photorealistic', 'image_tier_quality', 'photorealistic', 'presentation_quality', 1, NULL),
('ck_tier_q_production', 'image_tier_quality', 'production', 'presentation_quality', 1, NULL),
('ck_tier_q_investor', 'image_tier_quality', 'investor', 'presentation_quality', 1, NULL),
('ck_tier_q_pitch_deck', 'image_tier_quality', 'pitch deck', 'presentation_quality', 1, NULL),
('ck_tier_q_print_ready', 'image_tier_quality', 'print ready', 'presentation_quality', 1, NULL),
('ck_tier_q_marketing_hero', 'image_tier_quality', 'marketing hero', 'presentation_quality', 1, NULL);

-- Extend intent decision log for tier classification (reuse matched_by)
-- task_type already present; use task_type='image_tier' for tier decisions.

-- ── Ticket events: actor attribution + create dedup ───────────────────────────
ALTER TABLE agentsam_ticket_events ADD COLUMN actor_type TEXT;
ALTER TABLE agentsam_ticket_events ADD COLUMN actor_id TEXT;
ALTER TABLE agentsam_tickets ADD COLUMN dedup_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_tickets_dedup
  ON agentsam_tickets(dedup_key) WHERE dedup_key IS NOT NULL;

-- ── Correct tainted / missing content_tier before arm split ───────────────────
UPDATE image_generation_drafts
SET content_tier = 'presentation_quality', updated_at = unixepoch()
WHERE id IN (
  'igen_6a8054ea47a0470b',
  'igen_b1552e8dbeb44167',
  'igen_0953889a06fc4643',
  'igen_9dd239c4e6c44b12'
) AND (content_tier IS NULL OR content_tier = '');

UPDATE agentsam_reward_events
SET content_tier = 'presentation_quality'
WHERE content_tier IS NULL
  AND (
    metadata_json LIKE '%igen_6a8054ea47a0470b%'
    OR metadata_json LIKE '%igen_b1552e8dbeb44167%'
    OR metadata_json LIKE '%igen_0953889a06fc4643%'
    OR metadata_json LIKE '%igen_9dd239c4e6c44b12%'
  );

-- Today's three test gens were correctly labeled — no correction needed.

-- ── Pause legacy shared image arms; seed per-(model,tier) arms with cost priors ─
UPDATE agentsam_routing_arms
SET is_paused = 1,
    pause_reason = 'superseded_by_per_tier_arms_818',
    updated_at = unixepoch()
WHERE id IN ('ra_img_flash_ws', 'ra_img_pro_ws', 'ra_7d90fdbf31ab3c7b')
  AND workspace_id = 'ws_inneranimalmedia';

-- Priors: flash ~0.0045, pro ~0.015, gpt-image-2 draft/std ~0.042, presentation ~0.21
-- cost_n=1 so cost_mean is trusted for soft caps / scoring from day one.
-- mode must differ per tier (UNIQUE workspace+task_type+mode+model_key+agent_slug).
INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id, intent_slug,
  success_alpha, success_beta, cost_n, cost_mean, latency_n, latency_mean,
  is_active, is_eligible, is_paused, total_executions, updated_at
) VALUES
('ra_img_flash_draft', 'image_generation', 'draft', 'gemini-3.1-flash-image', 'google', 'ws_inneranimalmedia', 'image_tier_draft',
  2, 1, 1, 0.0045, 0, 0, 1, 1, 0, 0, unixepoch()),
('ra_img_flash_standard', 'image_generation', 'standard', 'gemini-3.1-flash-image', 'google', 'ws_inneranimalmedia', 'image_tier_standard',
  2, 1, 1, 0.0045, 0, 0, 1, 1, 0, 0, unixepoch()),
('ra_img_flash_quality', 'image_generation', 'quality', 'gemini-3.1-flash-image', 'google', 'ws_inneranimalmedia', 'image_tier_quality',
  1.5, 1, 1, 0.0045, 0, 0, 1, 1, 0, 0, unixepoch()),
('ra_img_pro_draft', 'image_generation', 'draft', 'gemini-3-pro-image', 'google', 'ws_inneranimalmedia', 'image_tier_draft',
  1.2, 1, 1, 0.015, 0, 0, 1, 1, 0, 0, unixepoch()),
('ra_img_pro_standard', 'image_generation', 'standard', 'gemini-3-pro-image', 'google', 'ws_inneranimalmedia', 'image_tier_standard',
  2, 1, 1, 0.015, 0, 0, 1, 1, 0, 0, unixepoch()),
('ra_img_pro_quality', 'image_generation', 'quality', 'gemini-3-pro-image', 'google', 'ws_inneranimalmedia', 'image_tier_quality',
  2, 1, 1, 0.015, 0, 0, 1, 1, 0, 0, unixepoch()),
('ra_img_gpt2_draft', 'image_generation', 'draft', 'gpt-image-2', 'openai', 'ws_inneranimalmedia', 'image_tier_draft',
  1.2, 1, 1, 0.042, 0, 0, 1, 1, 0, 0, unixepoch()),
('ra_img_gpt2_standard', 'image_generation', 'standard', 'gpt-image-2', 'openai', 'ws_inneranimalmedia', 'image_tier_standard',
  1.5, 1, 1, 0.08, 0, 0, 1, 1, 0, 0, unixepoch()),
('ra_img_gpt2_quality', 'image_generation', 'quality', 'gpt-image-2', 'openai', 'ws_inneranimalmedia', 'image_tier_quality',
  2, 1, 1, 0.21, 0, 0, 1, 1, 0, 0, unixepoch());

-- Tickets: fold cost/latency + per-tier into one; mark classification work
INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, created_at, updated_at, closed_at
) VALUES
(
  'tkt_thompson_cost_tier_split',
  'Thompson cost-aware per-tier image arms (priors + score blend)',
  'active',
  NULL,
  'iam-core',
  'image-gen',
  '["thompson","cost","tier"]',
  'P1',
  'plans/active/INTENT-KEYWORDS-CLASSIFIER-REWARD-EVENTS.md',
  '[]',
  '[]',
  'tkt_thompson_cost_latency_bias',
  unixepoch(),
  unixepoch(),
  NULL
),
(
  'tkt_classification_keywords_unify',
  'Unify image intent + tier wordlists into agentsam_classification_keywords',
  'active',
  NULL,
  'iam-core',
  'routing',
  '["intent","tier","d1"]',
  'P0',
  NULL,
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
);

UPDATE agentsam_tickets
SET status = 'backlog',
    blocked_by = '["tkt_thompson_cost_tier_split"]',
    updated_at = unixepoch()
WHERE id IN ('tkt_thompson_cost_latency_bias', 'tkt_per_content_tier_arms');

UPDATE agentsam_tickets
SET status = 'active',
    title = 'Enumerate non-image success_alpha writers (routing.js, thompson.js, agent-run-routing.js, cms-theme, webhooks, eto, antigravity)',
    tags = '["single-writer","scoped"]',
    priority = 'P1',
    updated_at = unixepoch()
WHERE id = 'tkt_consolidate_arm_writers';

INSERT INTO agentsam_ticket_events (
  id, ticket_id, event_type, detail, actor_type, created_at
) VALUES (
  'tke_arm_writers_scope_818',
  'tkt_consolidate_arm_writers',
  'note',
  'Scoped 2026-07-11 grep: direct success_alpha writers outside applyRewardEvent — src/core/routing.js, thompson.js, agent-run-routing.js, agent-model-resolver.js, cms-theme-handlers.js, antigravity-interactions.js, performance-eto.js, resolveModel.js, routing-cron.js, api/webhooks/supabase.js. Image path is single-writer; migrate siblings next.',
  'agent_sam',
  unixepoch()
);

-- Ticket MCP/catalog tools (same writers as /api/tickets)
INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, description, input_schema,
   handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global, updated_at)
SELECT
  'agentsam_ticket_list', 'agentsam_ticket_list', 'Ticket List', 'tickets',
  'List platform engineering tickets (agentsam_tickets). Filters: status, project, subsystem, priority.',
  '{"type":"object","additionalProperties":false,"properties":{"status":{"type":"string"},"project":{"type":"string"},"subsystem":{"type":"string"},"priority":{"type":"string"},"workable":{"type":"boolean"},"limit":{"type":"number"}}}',
  'agent', '{"handler":"agentsam_ticket_list","module":"tools/builtin/tickets.js"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'agentsam_ticket_list');

INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, description, input_schema,
   handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global, updated_at)
SELECT
  'agentsam_ticket_get', 'agentsam_ticket_get', 'Ticket Get', 'tickets',
  'Get one platform ticket by id.',
  '{"type":"object","additionalProperties":false,"properties":{"id":{"type":"string"}},"required":["id"]}',
  'agent', '{"handler":"agentsam_ticket_get","module":"tools/builtin/tickets.js"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'agentsam_ticket_get');

INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, description, input_schema,
   handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global, updated_at)
SELECT
  'agentsam_ticket_create', 'agentsam_ticket_create', 'Ticket Create', 'tickets',
  'Create a platform engineering ticket. Pass dedup_key to avoid double-create on retry.',
  '{"type":"object","additionalProperties":false,"properties":{"title":{"type":"string"},"status":{"type":"string"},"priority":{"type":"string"},"project":{"type":"string"},"subsystem":{"type":"string"},"doc_path":{"type":"string"},"dedup_key":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}}},"required":["title"]}',
  'agent', '{"handler":"agentsam_ticket_create","module":"tools/builtin/tickets.js"}',
  'medium', 1, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'agentsam_ticket_create');

INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, description, input_schema,
   handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global, updated_at)
SELECT
  'agentsam_ticket_set_status', 'agentsam_ticket_set_status', 'Ticket Set Status', 'tickets',
  'Set ticket status (server enforces status_reason for blocked/abandoned).',
  '{"type":"object","additionalProperties":false,"properties":{"id":{"type":"string"},"status":{"type":"string"},"status_reason":{"type":"string"}},"required":["id","status"]}',
  'agent', '{"handler":"agentsam_ticket_set_status","module":"tools/builtin/tickets.js"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'agentsam_ticket_set_status');

INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, description, input_schema,
   handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global, updated_at)
SELECT
  'agentsam_ticket_add_note', 'agentsam_ticket_add_note', 'Ticket Add Note', 'tickets',
  'Append a note event to a platform ticket.',
  '{"type":"object","additionalProperties":false,"properties":{"id":{"type":"string"},"note":{"type":"string"}},"required":["id","note"]}',
  'agent', '{"handler":"agentsam_ticket_add_note","module":"tools/builtin/tickets.js"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'agentsam_ticket_add_note');

-- Plans consolidation: delete chat-junk rows; abandon empty lane placeholders
DELETE FROM agentsam_plans WHERE id IN (
  'plan_382f1d0dcf8d0817',
  'plan_61210fa85776e225',
  'plan_585e8288319fd85a'
);

UPDATE agentsam_plans
SET status = 'abandoned',
    session_notes = COALESCE(session_notes || char(10), '') ||
      'abandoned 2026-07-11: never populated, superseded by tickets system'
WHERE id IN (
  'plan_lane_agent_core',
  'plan_lane_dashboard_ux',
  'plan_lane_infra_security',
  'plan_lane_cms_editor',
  'plan_browser_cdt_verification_2026',
  'plan_cf_websearch_2026',
  'plan_cf_agents_gateway_2026',
  'plan_designstudio_lane_2026',
  'plan_public_site_clients_2026',
  'plan_dashboard_reorder_2026_0530',
  'plan_iam_meet_realtimekit_2026',
  'plan_cf_codemode_mcp_2026',
  'plan_3c04f1234e319c89'
)
AND status = 'active';
