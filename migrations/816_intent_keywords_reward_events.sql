-- 816: Intent keywords (DB-driven) + intent decision log + multi-tenant reward events.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/816_intent_keywords_reward_events.sql

-- ── Intent keywords (replace hardcoded JS wordlists) ──────────────────────────
CREATE TABLE IF NOT EXISTS agentsam_intent_keywords (
  id          TEXT PRIMARY KEY,
  task_type   TEXT NOT NULL,          -- e.g. image_generation
  keyword_type TEXT NOT NULL,         -- noun | verb | soft_reject | escalate_hint
  pattern     TEXT NOT NULL,          -- literal keyword or short phrase (not full regex)
  active      INTEGER NOT NULL DEFAULT 1,
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_intent_keywords_task_type
  ON agentsam_intent_keywords(task_type, keyword_type, active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_keywords_unique
  ON agentsam_intent_keywords(task_type, keyword_type, pattern);

-- ── Classification decision log (never silent) ────────────────────────────────
CREATE TABLE IF NOT EXISTS agentsam_intent_decisions (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT,
  workspace_id     TEXT,
  user_id          TEXT,
  conversation_id  TEXT,
  task_type        TEXT NOT NULL DEFAULT 'image_generation',
  message_excerpt  TEXT,
  matched_by       TEXT NOT NULL,   -- keyword | classifier | neither | rejected_guard
  is_match         INTEGER NOT NULL DEFAULT 0,
  confidence       REAL,
  model_key        TEXT,
  provider         TEXT,
  routing_arm_id   TEXT,
  reason           TEXT,
  latency_ms       INTEGER,
  metadata_json    TEXT NOT NULL DEFAULT '{}',
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_intent_decisions_matched
  ON agentsam_intent_decisions(task_type, matched_by, created_at);
CREATE INDEX IF NOT EXISTS idx_intent_decisions_ws
  ON agentsam_intent_decisions(workspace_id, task_type, created_at);

-- ── Reward events (multi-tenant / multi-task — no identity defaults) ──────────
CREATE TABLE IF NOT EXISTS agentsam_reward_events (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  workspace_id     TEXT NOT NULL,
  task_type        TEXT NOT NULL,
  agent_run_id     TEXT,
  tool_call_log_id TEXT,
  routing_arm_id   TEXT,
  model_key        TEXT,
  provider         TEXT,
  content_tier     TEXT,
  signal_type      TEXT NOT NULL,
  signal_source    TEXT NOT NULL DEFAULT 'user',
  signal_value     REAL NOT NULL DEFAULT 0,
  alpha_delta      REAL NOT NULL DEFAULT 0,
  beta_delta       REAL NOT NULL DEFAULT 0,
  cost_usd         REAL,
  latency_ms       INTEGER,
  reason           TEXT,
  metadata_json    TEXT NOT NULL DEFAULT '{}',
  dedup_key        TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_at_unix  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_reward_events_arm
  ON agentsam_reward_events(routing_arm_id, created_at_unix);
CREATE INDEX IF NOT EXISTS idx_reward_events_task_model
  ON agentsam_reward_events(task_type, model_key, created_at_unix);
CREATE INDEX IF NOT EXISTS idx_reward_events_tenant_ws
  ON agentsam_reward_events(tenant_id, workspace_id, task_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_events_dedup
  ON agentsam_reward_events(dedup_key) WHERE dedup_key IS NOT NULL;

-- Seed image_generation nouns/verbs (INSERT OR IGNORE — add rows via D1, no deploy)
INSERT OR IGNORE INTO agentsam_intent_keywords (id, task_type, keyword_type, pattern, active, notes) VALUES
('ik_img_n_image', 'image_generation', 'noun', 'image', 1, NULL),
('ik_img_n_images', 'image_generation', 'noun', 'images', 1, NULL),
('ik_img_n_photo', 'image_generation', 'noun', 'photo', 1, NULL),
('ik_img_n_photos', 'image_generation', 'noun', 'photos', 1, NULL),
('ik_img_n_photograph', 'image_generation', 'noun', 'photograph', 1, NULL),
('ik_img_n_photographs', 'image_generation', 'noun', 'photographs', 1, NULL),
('ik_img_n_product_photo', 'image_generation', 'noun', 'product photo', 1, NULL),
('ik_img_n_hero', 'image_generation', 'noun', 'hero', 1, NULL),
('ik_img_n_hero_image', 'image_generation', 'noun', 'hero image', 1, NULL),
('ik_img_n_poster', 'image_generation', 'noun', 'poster', 1, NULL),
('ik_img_n_wallpaper', 'image_generation', 'noun', 'wallpaper', 1, NULL),
('ik_img_n_illustration', 'image_generation', 'noun', 'illustration', 1, NULL),
('ik_img_n_artwork', 'image_generation', 'noun', 'artwork', 1, NULL),
('ik_img_n_graphic', 'image_generation', 'noun', 'graphic', 1, NULL),
('ik_img_n_thumbnail', 'image_generation', 'noun', 'thumbnail', 1, NULL),
('ik_img_n_banner', 'image_generation', 'noun', 'banner', 1, NULL),
('ik_img_n_logo', 'image_generation', 'noun', 'logo', 1, NULL),
('ik_img_n_render', 'image_generation', 'noun', 'render', 1, NULL),
('ik_img_n_concept_art', 'image_generation', 'noun', 'concept art', 1, NULL),
('ik_img_n_cover', 'image_generation', 'noun', 'cover', 1, NULL),
('ik_img_n_visual', 'image_generation', 'noun', 'visual', 1, NULL),
('ik_img_n_background', 'image_generation', 'noun', 'background', 1, NULL),
('ik_img_n_icon', 'image_generation', 'noun', 'icon', 1, NULL),
('ik_img_n_avatar', 'image_generation', 'noun', 'avatar', 1, NULL),
('ik_img_n_picture', 'image_generation', 'noun', 'picture', 1, NULL),
('ik_img_n_art', 'image_generation', 'noun', 'art', 1, NULL),
('ik_img_n_mockup', 'image_generation', 'noun', 'mockup', 1, NULL),
('ik_img_n_favicon', 'image_generation', 'noun', 'favicon', 1, NULL),
('ik_img_n_og_image', 'image_generation', 'noun', 'og image', 1, NULL),
('ik_img_n_social_card', 'image_generation', 'noun', 'social card', 1, NULL),
('ik_img_n_app_icon', 'image_generation', 'noun', 'app icon', 1, NULL),
('ik_img_n_splash_screen', 'image_generation', 'noun', 'splash screen', 1, NULL),
('ik_img_n_ui_asset', 'image_generation', 'noun', 'ui asset', 1, NULL),
('ik_img_v_generate', 'image_generation', 'verb', 'generate', 1, NULL),
('ik_img_v_create', 'image_generation', 'verb', 'create', 1, NULL),
('ik_img_v_make', 'image_generation', 'verb', 'make', 1, NULL),
('ik_img_v_design', 'image_generation', 'verb', 'design', 1, NULL),
('ik_img_v_render', 'image_generation', 'verb', 'render', 1, NULL),
('ik_img_v_draw', 'image_generation', 'verb', 'draw', 1, NULL),
('ik_img_v_paint', 'image_generation', 'verb', 'paint', 1, NULL),
('ik_img_v_produce', 'image_generation', 'verb', 'produce', 1, NULL),
('ik_img_v_craft', 'image_generation', 'verb', 'craft', 1, NULL),
('ik_img_v_build', 'image_generation', 'verb', 'build', 1, NULL),
('ik_img_v_illustrate', 'image_generation', 'verb', 'illustrate', 1, NULL),
('ik_img_v_visualize', 'image_generation', 'verb', 'visualize', 1, NULL),
('ik_img_e_shot', 'image_generation', 'escalate_hint', 'shot', 1, 'soft cue → classifier'),
('ik_img_e_scene', 'image_generation', 'escalate_hint', 'scene', 1, NULL),
('ik_img_e_portrait', 'image_generation', 'escalate_hint', 'portrait', 1, NULL),
('ik_img_e_still', 'image_generation', 'escalate_hint', 'still life', 1, NULL),
('ik_img_e_depict', 'image_generation', 'escalate_hint', 'depict', 1, NULL),
('ik_img_e_depicts', 'image_generation', 'escalate_hint', 'depicting', 1, NULL);

-- Ticket status
UPDATE agentsam_tickets
SET status = 'active',
    title = 'agentsam_reward_events — multi-tenant reward ledger + single-writer thumbs',
    updated_at = unixepoch(),
    closed_at = NULL
WHERE id = 'tkt_reward_events_tenant';

INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, created_at, updated_at, closed_at
) VALUES (
  'tkt_intent_keywords_classifier',
  'Image intent — D1 keywords + classifier escalate-on-miss + decision log',
  'active',
  NULL,
  'iam-core',
  'routing',
  '["intent","keywords","classifier"]',
  'P0',
  NULL,
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL
);
