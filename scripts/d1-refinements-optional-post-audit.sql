-- Optional refinements after docs/d1-audit-inneranimalmedia-business-2026-03-22.md
-- inneranimalmedia-business (cf87b717-d4e2-4cf8-bab0-a81268e32d49)
-- Review each block; uncomment only what you want.

-- -----------------------------------------------------------------------------
-- 1) Group meaux-solar with dark family in theme picker (optional aesthetic)
-- -----------------------------------------------------------------------------
-- UPDATE cms_themes SET theme_family = 'dark', sort_order = 25 WHERE slug = 'meaux-solar';

-- -----------------------------------------------------------------------------
-- 2) Normalize sort_order so Kimbie lists after Solarized dark in same family (optional)
-- -----------------------------------------------------------------------------
-- UPDATE cms_themes SET sort_order = 12 WHERE slug = 'kimbie-dark';

-- -----------------------------------------------------------------------------
-- 3) Seed agentsam_agent_run from existing agent_sessions (one-time backfill sketch)
--     Adjust JOIN keys to match your live agent_sessions schema before running.
-- -----------------------------------------------------------------------------
/*
INSERT INTO agentsam_agent_run (id, user_id, workspace_id, conversation_id, status, trigger, created_at, completed_at)
SELECT
  lower(hex(randomblob(16))),
  user_id,
  NULL,
  id,
  'succeeded',
  'backfill',
  created_at,
  updated_at
FROM agent_sessions
WHERE NOT EXISTS (SELECT 1 FROM agentsam_agent_run r WHERE r.conversation_id = agent_sessions.id)
LIMIT 500;
*/

-- -----------------------------------------------------------------------------
-- 4) Sanity: theme picker order (read-only)
-- -----------------------------------------------------------------------------
-- SELECT slug, theme_family, sort_order, is_system FROM cms_themes ORDER BY theme_family, sort_order, name;
