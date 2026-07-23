-- 1003: OAuth token liveness — normalize updated_at, deactivate dead tokens, rule + ticket.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/1003_oauth_token_liveness.sql

-- 1) Repair TEXT ISO written into INTEGER updated_at (google_calendar_sync footgun)
UPDATE user_oauth_tokens
SET updated_at = CAST(strftime('%s', updated_at) AS INTEGER)
WHERE typeof(updated_at) = 'text'
  AND length(trim(updated_at)) >= 10
  AND CAST(strftime('%s', updated_at) AS INTEGER) > 1000000000;

-- 2) Deactivate expired tokens with no refresh material (decorative is_active=1)
UPDATE user_oauth_tokens
SET is_active = 0,
    updated_at = unixepoch(),
    last_refresh_at = unixepoch(),
    last_refresh_error_code = COALESCE(last_refresh_error_code, 'ACCESS_EXPIRED_NO_REFRESH')
WHERE COALESCE(is_active, 1) = 1
  AND revoked_at IS NULL
  AND expires_at IS NOT NULL
  AND expires_at < unixepoch()
  AND (refresh_token IS NULL OR length(trim(refresh_token)) = 0)
  AND (refresh_token_encrypted IS NULL OR length(trim(refresh_token_encrypted)) = 0)
  AND (vault_refresh_token_id IS NULL OR length(trim(vault_refresh_token_id)) = 0);

-- 3) Stale duplicate google_drive rows for same user+email: keep newest expires_at, deactivate older
UPDATE user_oauth_tokens
SET is_active = 0,
    updated_at = unixepoch(),
    last_refresh_error_code = COALESCE(last_refresh_error_code, 'STALE_DUPLICATE_ACCOUNT')
WHERE COALESCE(is_active, 1) = 1
  AND provider = 'google_drive'
  AND rowid IN (
    SELECT o.rowid
    FROM user_oauth_tokens o
    WHERE o.provider = 'google_drive'
      AND COALESCE(o.is_active, 1) = 1
      AND EXISTS (
        SELECT 1
        FROM user_oauth_tokens n
        WHERE n.user_id = o.user_id
          AND n.provider = o.provider
          AND lower(COALESCE(n.account_email, n.account_identifier, '')) =
              lower(COALESCE(o.account_email, o.account_identifier, ''))
          AND n.account_identifier != o.account_identifier
          AND COALESCE(n.expires_at, 0) > COALESCE(o.expires_at, 0)
      )
  );

INSERT OR REPLACE INTO agentsam_rules_document (
  id, rule_key, title, body_markdown, is_active, created_at_epoch, updated_at_epoch, sort_order, rule_type
) VALUES (
  'rule_oauth_token_liveness',
  'rule_oauth_token_liveness',
  'LOCKED: user_oauth_tokens.is_active must track live credentials',
  '# OAuth token liveness (LOCKED)

## Disease
`user_oauth_tokens.is_active` defaults to 1 at INSERT and was never flipped to 0 on expiry.
Expired Gmail / Drive / Cloudflare / Supabase rows read identical to fresh grants.

## Law
1. `is_active=1` means the connection is still considered usable (not revoked, not abandoned after failed refresh).
2. On access expiry with no refresh material → `is_active=0` immediately.
3. On refresh failure → `is_active=0` + `last_refresh_error_code`.
4. On successful refresh → `is_active=1`, clear error code, bump `expires_at` / `updated_at` as **INTEGER unixepoch**.
5. Never write `datetime(''now'')` / ISO text into `updated_at` (INTEGER column).
6. Cron: `sweepOAuthTokenLiveness` every 30 minutes (thirty-minute-cron).
7. GitHub rows with NULL `expires_at` stay active until revoke / explicit disconnect — they are not PK duplicates when `user_id` differs.

## Connected-provider queries
Require `COALESCE(is_active,1)=1` AND (`expires_at` NULL OR future OR refresh material present).
',
  1,
  unixepoch(),
  unixepoch(),
  51,
  'platform'
);

INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, created_at, updated_at, closed_at,
  consecutive_pass_count, required_pass_count
) VALUES (
  'tkt_oauth_token_liveness',
  'OAuth: maintain is_active on expiry/refresh failure + unix updated_at',
  'active',
  'Sweep cron + on-read deactivate; fix calendar TEXT updated_at; dual-pass before shipped',
  'inneranimalmedia',
  'integrations',
  '["p0","oauth","d1","liveness"]',
  'P0',
  'plans/active/AGENTSAM-FILE-CREATE-HTML-FAILURES-2026-07-22.md',
  '[]',
  '[]',
  NULL,
  unixepoch(),
  unixepoch(),
  NULL,
  0,
  2
);
