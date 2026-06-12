-- MovieMode: artifact_id links + moviemode_render tool registration.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/615_moviemode_artifact_link_and_tools.sql

ALTER TABLE moviemode_exports ADD COLUMN artifact_id TEXT;
CREATE INDEX IF NOT EXISTS idx_moviemode_exports_artifact ON moviemode_exports(artifact_id) WHERE artifact_id IS NOT NULL;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type,
  description, is_active, tool_key, handler_key, risk_level, requires_approval, modes_json
) VALUES (
  'ast_moviemode_render',
  'moviemode_render',
  'MovieMode Render',
  'media',
  'media',
  'Queue a Remotion render job for a MovieMode project timeline.',
  1,
  'moviemode_render',
  'moviemode_render',
  'medium',
  0,
  '["agent","multitask"]'
);

UPDATE agentsam_tools
SET handler_key = 'moviemode_render',
    handler_type = 'media',
    is_active = 1,
    updated_at = unixepoch()
WHERE tool_name = 'moviemode_render';
