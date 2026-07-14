-- 856: Canonical client_apps / cms_tenants logos for IAM + Companions
-- IAM black /\ mark; Companions dog/cat mark. Keep auth login in sync via static auth HTML + upload-auth-pages.

UPDATE client_apps
SET
  logo_url = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/527ab85a-01bb-4125-57bb-694fe8be8700/public',
  updated_at = datetime('now')
WHERE app_key = 'inneranimalmedia';

UPDATE client_apps
SET
  logo_url = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/9a00de35-fa41-49da-e431-a5f004cf5e00/avatar',
  updated_at = datetime('now')
WHERE app_key = 'companionscpas';

UPDATE cms_tenants
SET logo_url = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/527ab85a-01bb-4125-57bb-694fe8be8700/public'
WHERE slug = 'inneranimalmedia';
