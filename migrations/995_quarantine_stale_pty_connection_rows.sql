-- 995: Quarantine stale / wrong-identity terminal_connections (keep inactive).
-- Real Sam Mac primary remains conn_mac_local → wss://localpty.inneranimalmedia.com
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/995_quarantine_stale_pty_connection_rows.sql

-- Empty-ws local stub under canonical Sam — never a live lane
UPDATE terminal_connections
SET
  is_active = 0,
  is_default = 0,
  description = 'QUARANTINE: empty ws_url stub — use conn_mac_local (localpty). Not a second Mac.',
  updated_at = unixepoch()
WHERE id = 'conn_a5d785c5936245cd'
  AND user_id = 'au_871d920d1233cbd1';

-- "sam_primary" name on Meauxbility Sam identity (au_e3b3457d8243e46e = sam@meauxbility.org),
-- not canonical IAM operator (au_871d920d1233cbd1 = info@inneranimals.com). Inactive GCP duplicate.
UPDATE terminal_connections
SET
  is_active = 0,
  is_default = 0,
  description = 'QUARANTINE: wrong-lane identity (meauxbility au_e3…) — not IAM primary; use conn_gcp_iam_tunnel under au_871d…',
  updated_at = unixepoch()
WHERE id = 'conn_sam_primary_token_mint'
  AND user_id = 'au_e3b3457d8243e46e';
