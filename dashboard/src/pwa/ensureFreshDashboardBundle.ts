/**
 * Detect stale dashboard JS (PWA / runtime cache).
 * Never hard-reloads on phone — surfaces banner via iam-pwa-update-available.
 * Bundled sha comes from Vite `__IAM_BUILD_GIT_SHA__`; remote from /pwa-build-meta.json.
 */

import { notifyPwaUpdateAvailable } from './pwaUpdateEvents';
import { activateWaitingServiceWorker, purgeDashboardJsCaches } from './purgePwaCaches';

declare const __IAM_BUILD_GIT_SHA__: string;

const SESSION_SHA_KEY = 'iam_dashboard_git_sha';

export { purgeDashboardJsCaches } from './purgePwaCaches';

function normalizeSha(raw: string): string {
  return String(raw || '').trim().slice(0, 12);
}

function shasMatch(a: string, b: string): boolean {
  const x = normalizeSha(a);
  const y = normalizeSha(b);
  if (!x || !y) return true;
  return x === y || x.startsWith(y.slice(0, 7)) || y.startsWith(x.slice(0, 7));
}

/** Compare bundled vs deployed sha; notify when stale (banner-only — user chooses reload). */
export async function ensureFreshDashboardBundle(): Promise<void> {
  if (typeof window === 'undefined') return;

  const bundledSha =
    typeof __IAM_BUILD_GIT_SHA__ !== 'undefined' ? normalizeSha(__IAM_BUILD_GIT_SHA__) : '';

  try {
    const res = await fetch('/pwa-build-meta.json', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return;
    const meta = (await res.json()) as { git_sha?: string; cache_bust?: string };
    const remoteSha = normalizeSha(meta.git_sha || '');

    if (!remoteSha) return;

    if (shasMatch(bundledSha, remoteSha)) {
      sessionStorage.setItem(SESSION_SHA_KEY, remoteSha);
      return;
    }

    sessionStorage.setItem(SESSION_SHA_KEY, remoteSha);
    await purgeDashboardJsCaches();
    await activateWaitingServiceWorker();
    notifyPwaUpdateAvailable({ reason: 'bundle_stale', remoteSha });
  } catch {
    /* non-fatal */
  }
}
