-- 214: Canonical tenant on auth_users for session-backed tenant resolution (worker getSession + fetchAuthUserTenantId).
-- Run once on D1 inneranimalmedia-business when ready:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/214_auth_users_tenant_id.sql
-- Then backfill: UPDATE auth_users SET tenant_id = ? WHERE tenant_id IS NULL; (use each account's real tenant slug from billing/settings.)

ALTER TABLE auth_users ADD COLUMN tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_auth_users_tenant_id ON auth_users(tenant_id);
