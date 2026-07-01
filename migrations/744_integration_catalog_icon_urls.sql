-- 744: CF Images avatar URLs on integration_catalog (connector grid spine).
-- Resend / Stripe rows get column ready; icons added when brand assets land.

ALTER TABLE integration_catalog ADD COLUMN icon_url TEXT;

UPDATE integration_catalog SET icon_url = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/8e623df0-6bd7-4314-87c3-8b377e53e700/avatar'
WHERE slug = 'cloudflare';

UPDATE integration_catalog SET icon_url = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/cedec69a-4847-4cec-d4e3-e3dbb5619900/avatar'
WHERE slug = 'supabase';

UPDATE integration_catalog SET icon_url = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/c7d1b46f-9614-49d7-19d9-d1c8d2d77500/avatar'
WHERE slug = 'google_drive';

UPDATE integration_catalog SET icon_url = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/45164248-52e4-4bd0-d654-72ab6002b900/avatar'
WHERE slug = 'gmail';

-- Platform MCP + future MCP connectors (catalog slug agentsam = IAM hosted MCP)
UPDATE integration_catalog SET icon_url = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/0b4355d1-1883-4819-0c62-cdd1d6289f00/avatar'
WHERE slug IN ('agentsam', 'mcp');

-- Display names aligned with agent hub / mockup (catalog is canonical label)
UPDATE integration_catalog SET name = 'Cloudflare Developer Platform' WHERE slug = 'cloudflare';
UPDATE integration_catalog SET name = 'Supabase' WHERE slug = 'supabase';
UPDATE integration_catalog SET name = 'Google Drive' WHERE slug = 'google_drive';
UPDATE integration_catalog SET name = 'Gmail' WHERE slug = 'gmail';

-- Registry display_name mirror for tenant rows (idempotent)
UPDATE integration_registry SET display_name = 'Cloudflare Developer Platform'
WHERE lower(provider_key) IN ('cloudflare_oauth', 'cloudflare');

UPDATE integration_registry SET display_name = 'Supabase'
WHERE lower(provider_key) IN ('supabase_oauth', 'supabase');

UPDATE integration_registry SET display_name = 'Gmail'
WHERE lower(provider_key) IN ('google_gmail', 'gmail');
