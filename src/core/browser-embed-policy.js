/**
 * Origins that block passive iframe embedding (X-Frame-Options / frame-ancestors).
 * BrowserView must use Browser Run live view or MYBROWSER automation instead.
 */

/** @type {readonly string[]} */
export const BROWSER_RUN_REQUIRED_HOST_SUFFIXES = [
  'stripe.com',
  'dash.cloudflare.com',
];

/** @type {readonly string[]} */
export const BROWSER_TRUST_STRIPE_ORIGINS = [
  'https://dashboard.stripe.com',
  'https://connect.stripe.com',
  'https://docs.stripe.com',
];

/**
 * @param {string} urlOrOrigin
 * @returns {boolean}
 */
export function originRequiresBrowserRunEmbed(urlOrOrigin) {
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

/**
 * @param {string} urlOrOrigin
 * @returns {string|null}
 */
export function normalizeBrowserOrigin(urlOrOrigin) {
  const raw = String(urlOrOrigin || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}
