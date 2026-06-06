-- 600: BYOK R2 validation timestamps on user_storage_access_keys.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/600_user_storage_access_keys_validation.sql

ALTER TABLE user_storage_access_keys ADD COLUMN validated_at INTEGER;
ALTER TABLE user_storage_access_keys ADD COLUMN validation_status TEXT;
