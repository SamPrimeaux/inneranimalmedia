-- ============================================================
-- Migration 912: close out unresolvable / deferred tenant records
-- ============================================================

-- swampbloodgatorguides.com — client no longer active, domain not in CF account.
-- Deactivate rather than delete to preserve any historical CMS activity.
UPDATE cms_tenants
SET
  is_active  = 0,
  settings   = json_patch(COALESCE(settings, '{}'), '{"deferred_reason":"client_inactive_domain_not_in_cf"}'),
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'swampbloodgatorguides';

-- leadershiplegacydigital.com (Connor McNeely) — tenant record exists,
-- workspace exists, but domain setup is Connor's responsibility.
-- Mark as pending_owner_action so platform knows not to attempt CF operations.
UPDATE cms_tenants
SET
  domain_mode = 'saas_hostname',
  is_active   = 1,
  settings    = json_patch(COALESCE(settings, '{}'), json_object(
    'domain_setup_owner', 'tenant',
    'domain_setup_note',  'Connor McNeely self-serves domain connection. Platform will not configure CF custom hostname until tenant initiates.',
    'cf_saas_ready',      false
  )),
  updated_at  = CURRENT_TIMESTAMP
WHERE slug = 'connor-mcneely';
