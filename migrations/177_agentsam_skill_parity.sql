-- 177_agentsam_skill_parity.sql — Skills parity: columns, revision history, invocation log, slash backfill, v1 snapshot
-- Database: inneranimalmedia-business
-- Run once on production (repeat ALTERs will fail if columns already exist):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/177_agentsam_skill_parity.sql
--
-- Order: Step 1 → 2 → 3 → 4 → 5 (as documented in session planning).

-- Step 1 — Add missing columns to agentsam_skill (including access_mode + versioning metadata)
ALTER TABLE agentsam_skill ADD COLUMN icon TEXT NOT NULL DEFAULT '';
ALTER TABLE agentsam_skill ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'read_write'
  CHECK(access_mode IN ('read_only','read_write'));
ALTER TABLE agentsam_skill ADD COLUMN default_model_id TEXT;
ALTER TABLE agentsam_skill ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agentsam_skill ADD COLUMN slash_trigger TEXT;
ALTER TABLE agentsam_skill ADD COLUMN globs TEXT;
ALTER TABLE agentsam_skill ADD COLUMN always_apply INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agentsam_skill ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agentsam_skill ADD COLUMN tags TEXT;

-- Step 2 — Skill revision history (mirror of agentsam_rules_revision pattern)
CREATE TABLE IF NOT EXISTS agentsam_skill_revision (
  id           TEXT PRIMARY KEY DEFAULT ('skillrev_' || lower(hex(randomblob(8)))),
  skill_id     TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  version      INTEGER NOT NULL,
  changed_by   TEXT NOT NULL DEFAULT 'sam_primeaux',
  change_note  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES agentsam_skill(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_revision_skill_id ON agentsam_skill_revision(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_revision_version  ON agentsam_skill_revision(skill_id, version);

-- Step 3 — Skill invocation log (wire worker/agent to INSERT on use)
CREATE TABLE IF NOT EXISTS agentsam_skill_invocation (
  id              TEXT PRIMARY KEY DEFAULT ('skillinv_' || lower(hex(randomblob(8)))),
  skill_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL DEFAULT 'sam_primeaux',
  workspace_id    TEXT NOT NULL DEFAULT '',
  conversation_id TEXT,
  trigger_method  TEXT NOT NULL DEFAULT 'slash'
    CHECK(trigger_method IN ('slash','at','auto','api')),
  input_summary   TEXT,
  success         INTEGER NOT NULL DEFAULT 1,
  error_message   TEXT,
  duration_ms     INTEGER,
  model_used      TEXT,
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  cost_usd        REAL DEFAULT 0.0,
  invoked_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES agentsam_skill(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_invoc_skill_id  ON agentsam_skill_invocation(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_invoc_user      ON agentsam_skill_invocation(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_invoc_invoked   ON agentsam_skill_invocation(invoked_at);

-- Step 4 — Backfill slash triggers for the seven seeded skills (adjust IDs if your D1 differs)
UPDATE agentsam_skill SET slash_trigger = 'create-skill',   version = 1 WHERE id = 'skill_skill_creator';
UPDATE agentsam_skill SET slash_trigger = 'build-cf-agent', version = 1 WHERE id = 'skill_cf_agent_builder';
UPDATE agentsam_skill SET slash_trigger = 'web-perf',       version = 1 WHERE id = 'skill_web_perf';
UPDATE agentsam_skill SET slash_trigger = 'canvas-design',  version = 1 WHERE id = 'skill_canvas_design';
UPDATE agentsam_skill SET slash_trigger = 'excalidraw',     version = 1 WHERE id = 'skill_excalidraw_scene';
UPDATE agentsam_skill SET slash_trigger = 'monaco',        version = 1 WHERE id = 'skill_monaco_code';
UPDATE agentsam_skill SET slash_trigger = 'resend',        version = 1 WHERE id = 'skill_resend_cli';

-- Step 5 — Snapshot current content into revision table (v1 baseline; skip if v1 already exists for that skill)
INSERT INTO agentsam_skill_revision (skill_id, content_markdown, version, change_note)
SELECT s.id, s.content_markdown, 1, 'initial snapshot'
FROM agentsam_skill s
WHERE s.content_markdown != ''
  AND NOT EXISTS (
    SELECT 1 FROM agentsam_skill_revision r
    WHERE r.skill_id = s.id AND r.version = 1
  );
