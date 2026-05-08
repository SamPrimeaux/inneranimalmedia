-- 305: Deprecate dot-notation Anthropic model_key ghost rows in agentsam_ai; pause routing arms on non-canonical Anthropic keys.
-- Canonical active keys: claude-haiku-4-5-20251001, claude-sonnet-4-6
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/305_deprecate_dot_notation_anthropic_models.sql

UPDATE agentsam_ai
SET
  status = 'deprecated',
  show_in_picker = 0,
  updated_at = unixepoch()
WHERE provider = 'anthropic'
  AND model_key IN (
    'claude-haiku-4.5',
    'claude-haiku-3.5',
    'claude-sonnet-4.5',
    'claude-sonnet-4.6',
    'claude-sonnet-3.7',
    'claude-sonnet-3.5',
    'claude-opus-4.1',
    'claude-opus-4.6',
    'claude-opus-4.7'
  );

UPDATE agentsam_routing_arms
SET
  is_paused = 1,
  pause_reason = 'model_deprecated',
  updated_at = unixepoch()
WHERE provider = 'anthropic'
  AND model_key NOT IN ('claude-haiku-4-5-20251001', 'claude-sonnet-4-6');
