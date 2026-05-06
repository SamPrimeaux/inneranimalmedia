-- Preflight before migrations/282_r2_deploy_inventory_manifest.sql (CREATE UNIQUE INDEX on bucket_name + object_key).
-- Run remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./scripts/r2-inventory-duplicate-check.sql
--
-- If any rows returned, dedupe or merge duplicates before applying migration 282.

SELECT bucket_name, object_key, COUNT(*) AS cnt
FROM r2_object_inventory
GROUP BY bucket_name, object_key
HAVING COUNT(*) > 1;
