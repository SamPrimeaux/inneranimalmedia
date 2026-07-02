/**
 * Canonical brand icon URLs for integration connectors.
 *
 * Resolution order (see resolveIntegrationIconUrl):
 *   1. integration_catalog.icon_url       — set once in D1, highest priority
 *   2. integration_registry.custom_icon_url — per-tenant override
 *   3. INTEGRATION_BRAND_AVATARS[provider_key]  — this file, keyed by provider_key
 *   4. prefix fallback: cloudflare_* → CF icon, google_* → Drive icon
 *   5. null → IntegrationIconTile renders initials badge
 *
 * Rule: set icon_url in integration_catalog (D1) for anything new.
 * This file is only for legacy fallback and prefix-family coverage.
 * Never add per-tenant logic here.
 */

const CF = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/8e623df0-6bd7-4314-87c3-8b377e53e700/avatar';
const IAM = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/0b4355d1-1883-4819-0c62-cdd1d6289f00/avatar';
const SB = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/cedec69a-4847-4cec-d4e3-e3dbb5619900/avatar';
const GDRIVE = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/c7d1b46f-9614-49d7-19d9-d1c8d2d77500/avatar';
const GMAIL = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/45164248-52e4-4bd0-d654-72ab6002b900/avatar';

/** @type {Record<string, string>} */
export const INTEGRATION_BRAND_AVATARS = {
  // --- Cloudflare family (all provider_key variants) ---
  cloudflare: CF,
  cloudflare_oauth: CF,
  cloudflare_r2: CF,
  cloudflare_images: CF,
  cloudflare_kv: CF,
  cloudflare_d1: CF,
  cloudflare_do: CF,
  cloudflare_workers: CF,
  cloudflare_pages: CF,
  cloudflare_tunnel: CF,
  cloudflare_stream: CF,
  cloudflare_ai: CF,
  vectorize: CF,
  hyperdrive: SB, // Hyperdrive proxies Supabase Postgres — supabase icon is more accurate
  browser_rendering: CF,

  // --- IAM / Agent Sam family ---
  agentsam: IAM,
  agentsam_sdk: IAM,
  mcp: IAM,
  mcp_servers: IAM,
  local_tunnel: IAM,
  local_machine: IAM,
  inneranimalmedia_mcp_server: IAM,
  'inneranimalmedia-mcp-server': IAM,
  iam_mcp_platform: IAM,
  autodidact: IAM,
  claude_code: 'https://anthropic.com/favicon.ico',
  claude_code_cli: 'https://anthropic.com/favicon.ico',

  // --- Supabase ---
  supabase: SB,
  supabase_oauth: SB,

  // --- Google family ---
  google_drive: GDRIVE,
  google_gmail: GMAIL,
  gmail: GMAIL,
  google_calendar: 'https://www.google.com/s2/favicons?domain=calendar.google.com&sz=64',
  google_ai: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg',
  google_meet: 'https://www.google.com/s2/favicons?domain=meet.google.com&sz=64',

  // --- Third-party integrations ---
  github: 'https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png',
  stripe: 'https://js.stripe.com/v3/fingerprinted/img/favicon-32x32-e6d5e0dc.png',
  resend: 'https://resend.com/static/brand/resend-icon-black.png',
  anthropic: 'https://anthropic.com/favicon.ico',
  openai: 'https://openai.com/favicon.ico',
  cursor: 'https://www.cursor.com/favicon.ico',
  bluebubbles: 'https://bluebubbles.app/img/logo/logo.png',
};

/**
 * Resolve the best available icon URL for an integration.
 *
 * @param {string|null|undefined} providerKey     — integration_registry.provider_key
 * @param {string|null|undefined} catalogIconUrl  — integration_catalog.icon_url (highest priority)
 * @param {string|null|undefined} catalogSlug     — integration_catalog.slug (secondary key)
 * @param {string|null|undefined} registryIconUrl — integration_registry.custom_icon_url
 * @returns {string|null}
 */
export function resolveIntegrationIconUrl(providerKey, catalogIconUrl, catalogSlug, registryIconUrl) {
  // 1. Catalog icon_url — set once in D1, authoritative
  const fromCatalog = String(catalogIconUrl || '').trim();
  if (fromCatalog) return fromCatalog;

  // 2. Per-tenant registry override
  const fromRegistry = String(registryIconUrl || '').trim();
  if (fromRegistry) return fromRegistry;

  // 3. Exact key match on provider_key (underscored)
  const pk = String(providerKey || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (INTEGRATION_BRAND_AVATARS[pk]) return INTEGRATION_BRAND_AVATARS[pk];

  // 4. Exact key match on catalog slug (hyphenated)
  const slug = String(catalogSlug || '').trim().toLowerCase();
  if (slug && INTEGRATION_BRAND_AVATARS[slug]) return INTEGRATION_BRAND_AVATARS[slug];
  const slugUnder = slug.replace(/-/g, '_');
  if (slugUnder && INTEGRATION_BRAND_AVATARS[slugUnder]) return INTEGRATION_BRAND_AVATARS[slugUnder];

  // 5. Prefix fallback — any cloudflare_* or google_* provider gets the family icon
  if (pk.startsWith('cloudflare_') || pk.startsWith('cf_')) return INTEGRATION_BRAND_AVATARS.cloudflare;
  if (pk.startsWith('google_')) return INTEGRATION_BRAND_AVATARS.google_drive;

  return null;
}
