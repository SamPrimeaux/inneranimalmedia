-- 256: Optional UI-selected tenant/workspace overrides on auth_users (used by resolveIamActorContext).
-- Apply remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/256_auth_users_active_scope.sql

ALTER TABLE auth_users ADD COLUMN active_tenant_id TEXT;
ALTER TABLE auth_users ADD COLUMN active_workspace_id TEXT;
