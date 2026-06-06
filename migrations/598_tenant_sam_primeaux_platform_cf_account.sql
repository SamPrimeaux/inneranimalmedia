-- 598: Platform Cloudflare account on tenant_sam_primeaux workspaces (except secondary ws_sam_work_cf).
-- Main account: Info@inneranimals.com → ede6590ac0d2fb7daf155b35653457b2
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/598_tenant_sam_primeaux_platform_cf_account.sql

UPDATE agentsam_workspace
SET
  cloudflare_account_id = 'ede6590ac0d2fb7daf155b35653457b2',
  metadata_json = json_set(
    json_set(COALESCE(metadata_json, '{}'), '$.cloudflare_account_id', 'ede6590ac0d2fb7daf155b35653457b2'),
    '$.account_id', 'ede6590ac0d2fb7daf155b35653457b2'
  ),
  updated_at = unixepoch()
WHERE tenant_id = 'tenant_sam_primeaux'
  AND id != 'ws_sam_work_cf';
