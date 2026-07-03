/** Dashboard mirror of src/core/browser-embed-policy.js */

export const BROWSER_RUN_REQUIRED_HOST_SUFFIXES = [
  'stripe.com',
  'dash.cloudflare.com',
] as const;

export const BROWSER_TRUST_STRIPE_ORIGINS = [
  'https://dashboard.stripe.com',
  'https://connect.stripe.com',
  'https://docs.stripe.com',
] as const;

export function originRequiresBrowserRunEmbed(urlOrOrigin: string): boolean {
  const raw = String(urlOrOrigin || '').trim();
  if (!raw) return false;
  try {
    const host = new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.toLowerCase();
    return BROWSER_RUN_REQUIRED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export function normalizeBrowserOrigin(urlOrOrigin: string): string | null {
  const raw = String(urlOrOrigin || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}
