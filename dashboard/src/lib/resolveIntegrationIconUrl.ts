/**
 * Client mirror of src/core/integration-brand-avatars.js — icon_url from D1 first, then brand map.
 * Never use /assets/integrations/*.svg paths.
 */

const INTEGRATION_BRAND_AVATARS: Record<string, string> = {
  cloudflare: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/8e623df0-6bd7-4314-87c3-8b377e53e700/avatar',
  cloudflare_oauth: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/8e623df0-6bd7-4314-87c3-8b377e53e700/avatar',
  supabase: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/cedec69a-4847-4cec-d4e3-e3dbb5619900/avatar',
  supabase_oauth: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/cedec69a-4847-4cec-d4e3-e3dbb5619900/avatar',
  google_drive: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/c7d1b46f-9614-49d7-19d9-d1c8d2d77500/avatar',
  gmail: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/45164248-52e4-4bd0-d654-72ab6002b900/avatar',
  google_gmail: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/45164248-52e4-4bd0-d654-72ab6002b900/avatar',
  github: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/8e623df0-6bd7-4314-87c3-8b377e53e700/avatar',
  inneranimalmedia_mcp_server:
    'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/0b4355d1-1883-4819-0c62-cdd1d6289f00/avatar',
  'inneranimalmedia-mcp-server':
    'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/0b4355d1-1883-4819-0c62-cdd1d6289f00/avatar',
  iam_mcp_platform:
    'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/0b4355d1-1883-4819-0c62-cdd1d6289f00/avatar',
  agentsam: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/0b4355d1-1883-4819-0c62-cdd1d6289f00/avatar',
  mcp: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/0b4355d1-1883-4819-0c62-cdd1d6289f00/avatar',
};

export function resolveIntegrationIconUrl(
  providerKey?: string | null,
  catalogIconUrl?: string | null,
  catalogSlug?: string | null,
): string | null {
  const fromCatalog = String(catalogIconUrl || '').trim();
  if (fromCatalog) return fromCatalog;
  const pk = String(providerKey || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const slug = String(catalogSlug || '')
    .trim()
    .toLowerCase();
  if (INTEGRATION_BRAND_AVATARS[pk]) return INTEGRATION_BRAND_AVATARS[pk];
  if (slug && INTEGRATION_BRAND_AVATARS[slug]) return INTEGRATION_BRAND_AVATARS[slug];
  const pkHyphen = String(providerKey || '').trim().toLowerCase();
  if (INTEGRATION_BRAND_AVATARS[pkHyphen]) return INTEGRATION_BRAND_AVATARS[pkHyphen];
  return null;
}
