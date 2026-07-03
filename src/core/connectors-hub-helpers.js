/** Pure helpers for agent hub connectors catalog (no D1/auth imports — safe for unit tests). */

export const AGENT_HUB_REGISTRY_KEYS = [
  'github',
  'cloudflare_oauth',
  'google_drive',
  'google_gmail',
  'gmail',
  'supabase_oauth',
  'mcp_servers',
  'openai',
  'anthropic',
  'resend',
  'cloudflare_r2',
  'stripe',
];

/**
 * @param {string} providerKey
 */
export function connectorKindForProvider(providerKey) {
  const pk = String(providerKey || '').trim().toLowerCase();
  if (pk === 'inneranimalmedia-mcp-server' || pk === 'iam_mcp_platform') return 'mcp_remote';
  if (pk === 'web_search' || pk === 'sandbox_agent') return 'capability';
  if (pk === 'mcp_servers') return 'mcp_custom';
  if (pk === 'stripe') return 'mcp_remote';
  return 'oauth_api';
}

/**
 * @param {string} providerKey
 * @param {string} [returnTo]
 */
export function connectUrlForAgentHub(providerKey, returnTo = '/dashboard/agent') {
  const pk = String(providerKey || '').trim().toLowerCase();
  const rt = encodeURIComponent(returnTo);
  if (pk === 'inneranimalmedia-mcp-server' || pk === 'iam_mcp_platform') {
    return `https://mcp.inneranimalmedia.com/api/oauth/authorize?client_id=iam_mcp_inneranimalmedia&return_to=${rt}`;
  }
  if (pk === 'github') return `/api/oauth/github/start?return_to=${rt}`;
  if (pk === 'google_drive') return `/api/oauth/google/start?connectDrive=1&return_to=${rt}`;
  if (pk === 'google_gmail' || pk === 'gmail') return `/api/mail/gmail/start?return_to=${rt}`;
  if (pk === 'cloudflare_oauth' || pk === 'cloudflare') {
    return `/api/oauth/cloudflare/start?return_to=${rt}`;
  }
  if (pk === 'supabase_oauth' || pk === 'supabase') {
    return `/api/oauth/supabase/start?return_to=${rt}`;
  }
  if (pk === 'stripe') return `/api/oauth/stripe/start?return_to=${rt}`;
  if (pk === 'mcp_servers') return `/dashboard/settings?section=integrations&focus=mcp_servers`;
  return `/api/integrations/${encodeURIComponent(pk)}/connect?return_to=${rt}`;
}
