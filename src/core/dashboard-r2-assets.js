/**
 * Resolve dashboard SPA assets from the DASHBOARD R2 bucket (production: inneranimalmedia).
 * Supports incremental migration between legacy keys and `static/dashboard/app/*` without
 * deleting old objects. See docs/DASHBOARD_R2_ASSET_ARCHITECTURE.md.
 */

export const DASHBOARD_STATIC_AGENT_PREFIX = 'static/dashboard/agent/';
export const DASHBOARD_STATIC_APP_PREFIX = 'static/dashboard/app/';

/**
 * @param {{ get: (key: string) => Promise<{ body: ReadableStream | null, httpMetadata?: { contentType?: string } } | null> }} bucket
 * @param {string} assetKey Path after hostname (no leading slash), e.g. static/dashboard/app/learn.js
 */
export async function getDashboardR2Object(bucket, assetKey) {
  if (!bucket || typeof assetKey !== 'string' || !assetKey.length) return null;

  /** @type {string[]} */
  const keys = [];
  const add = (k) => {
    if (k && !keys.includes(k)) keys.push(k);
  };

  add(assetKey);
  // Vite `public/static/dashboard/shell.css` → dist ends up under agent prefix after rclone; HTML still
  // links `/static/dashboard/shell.css`. Try the nested key early (also covered by legacy add below).
  if (assetKey === 'static/dashboard/shell.css') {
    add(`${DASHBOARD_STATIC_AGENT_PREFIX}static/dashboard/shell.css`);
  }

  if (assetKey.startsWith(DASHBOARD_STATIC_AGENT_PREFIX)) {
    const rest = assetKey.slice(DASHBOARD_STATIC_AGENT_PREFIX.length);
    add(`${DASHBOARD_STATIC_APP_PREFIX}${rest}`);
    add(`dashboard/app/${rest}`);
  } else if (assetKey.startsWith(DASHBOARD_STATIC_APP_PREFIX)) {
    const rest = assetKey.slice(DASHBOARD_STATIC_APP_PREFIX.length);
    add(`${DASHBOARD_STATIC_AGENT_PREFIX}${rest}`);
    add(`dashboard/app/${rest}`);
  }

  // Legacy Worker lookups (preserve until R2 layout is fully normalized)
  add(`static/${assetKey}`);
  add(`${DASHBOARD_STATIC_AGENT_PREFIX}${assetKey}`);

  for (const key of keys) {
    const obj = await bucket.get(key);
    if (obj) return obj;
  }
  return null;
}

/**
 * HTML shell for authenticated dashboard / onboarding SPA routes.
 * @param {{ get: (key: string) => Promise<{ body: ReadableStream | null } | null> }} bucket
 */
export async function getDashboardSpaHtmlShell(bucket) {
  if (!bucket) return null;

  const shellKeys = [
    'static/dashboard/app.html',
    'static/dashboard/app/index.html',
    // deploy-frontend.sh syncs Vite dist to static/dashboard/agent/ (includes index.html)
    'static/dashboard/agent/index.html',
    'static/dashboard/agent.html',
    'dashboard/app/agent.html',
    'index.html',
  ];

  for (const key of shellKeys) {
    const obj = await bucket.get(key);
    if (obj) return obj;
  }
  return null;
}
