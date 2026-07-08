-- 802: Split email_logs.resend_id → external_message_id + provider;
--      scope received_emails + resend_emails by tenant (platform mail per domain).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/802_email_logs_external_id_received_emails_tenant_scope.sql

-- email_logs: provider-aware external ids
ALTER TABLE email_logs ADD COLUMN external_message_id TEXT;
ALTER TABLE email_logs ADD COLUMN provider TEXT;

UPDATE email_logs
SET external_message_id = TRIM(resend_id)
WHERE external_message_id IS NULL
  AND resend_id IS NOT NULL
  AND TRIM(resend_id) != '';

UPDATE email_logs
SET provider = 'gmail'
WHERE (provider IS NULL OR TRIM(provider) = '')
  AND external_message_id IS NOT NULL
  AND TRIM(external_message_id) != ''
  AND instr(external_message_id, '-') = 0
  AND length(trim(external_message_id)) >= 10
  AND lower(external_message_id) = external_message_id
  AND external_message_id GLOB '[0-9a-f]*';

UPDATE email_logs
SET provider = 'resend'
WHERE (provider IS NULL OR TRIM(provider) = '')
  AND external_message_id IS NOT NULL
  AND TRIM(external_message_id) != '';

CREATE INDEX IF NOT EXISTS idx_email_logs_user_tenant_created
  ON email_logs (user_id, tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_external_provider
  ON email_logs (provider, external_message_id);

-- resend_emails: tenant ownership for per-domain platform mail
ALTER TABLE resend_emails ADD COLUMN tenant_id TEXT;

UPDATE resend_emails
SET tenant_id = CASE lower(trim(COALESCE(client_id, '')))
  WHEN 'client_sam_primeaux' THEN 'tenant_sam_primeaux'
  WHEN 'client_church' THEN 'tenant_newiberia_20260110'
  WHEN 'client_pawlove' THEN 'tenant_pawlove'
  WHEN 'client_pelican' THEN 'tenant_pelican_peptides'
  ELSE tenant_id
END
WHERE tenant_id IS NULL OR TRIM(tenant_id) = '';

UPDATE resend_emails
SET tenant_id = (
  SELECT t.id
  FROM tenants t
  WHERE lower(trim(COALESCE(t.domain, ''))) = lower(trim(resend_emails.domain))
    AND COALESCE(t.is_active, 1) = 1
  ORDER BY
    CASE t.id
      WHEN 'tenant_sam_primeaux' THEN 0
      WHEN 'tenant_platform' THEN 1
      ELSE 2
    END
  LIMIT 1
)
WHERE tenant_id IS NULL OR TRIM(tenant_id) = '';

CREATE INDEX IF NOT EXISTS idx_resend_emails_tenant_address
  ON resend_emails (tenant_id, lower(address));

CREATE INDEX IF NOT EXISTS idx_resend_emails_tenant_domain
  ON resend_emails (tenant_id, lower(domain));

-- received_emails: tenant/user scope for Resend inbound
ALTER TABLE received_emails ADD COLUMN tenant_id TEXT;
ALTER TABLE received_emails ADD COLUMN user_id TEXT;
ALTER TABLE received_emails ADD COLUMN to_domain TEXT;
ALTER TABLE received_emails ADD COLUMN external_message_id TEXT;
ALTER TABLE received_emails ADD COLUMN provider TEXT DEFAULT 'resend';

CREATE INDEX IF NOT EXISTS idx_received_emails_tenant_date
  ON received_emails (tenant_id, date_received DESC);

CREATE INDEX IF NOT EXISTS idx_received_emails_tenant_user_date
  ON received_emails (tenant_id, user_id, date_received DESC);

CREATE INDEX IF NOT EXISTS idx_received_emails_external_provider
  ON received_emails (provider, external_message_id);
