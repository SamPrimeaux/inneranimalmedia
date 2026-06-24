-- 699: Push subscribe upsert — D1 rejects ON CONFLICT against partial unique indexes (579).
-- Code path uses SELECT+UPDATE/INSERT; this index supports future ON CONFLICT(tenant_id, hook_key).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/699_agentsam_hook_push_upsert_unique.sql

DROP INDEX IF EXISTS idx_agentsam_hook_key_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_hook_tenant_hook_key
  ON agentsam_hook(tenant_id, hook_key);
