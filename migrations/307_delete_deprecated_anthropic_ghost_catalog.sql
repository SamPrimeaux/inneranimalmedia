-- 307: Hard-delete invalid dot-notation and obsolete Anthropic catalog rows (never valid API ids; deprecated only polluted queries).
-- Valid sunset models stay deprecated; wrong key format = DELETE.
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/307_delete_deprecated_anthropic_ghost_catalog.sql

DELETE FROM agentsam_ai
WHERE provider = 'anthropic'
  AND status = 'deprecated'
  AND model_key IN (
    'claude-haiku-4.5',
    'claude-haiku-3.5',
    'claude-haiku-3',
    'claude-sonnet-4.5',
    'claude-sonnet-4.6',
    'claude-sonnet-3.7',
    'claude-sonnet-3.5',
    'claude-opus-4.1',
    'claude-opus-4.6',
    'claude-opus-4.7',
    'claude-3-5-haiku-20241022'
  );
