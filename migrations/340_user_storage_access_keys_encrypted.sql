-- 340: Encrypted R2 credential columns on user_storage_access_keys.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/340_user_storage_access_keys_encrypted.sql

ALTER TABLE user_storage_access_keys ADD COLUMN access_key_id_encrypted TEXT;
ALTER TABLE user_storage_access_keys ADD COLUMN secret_encrypted TEXT;

-- Remove legacy placeholder row (non-user CF R2 sample).
DELETE FROM user_storage_access_keys WHERE id = 'usak_sam_cf_r2_001';
