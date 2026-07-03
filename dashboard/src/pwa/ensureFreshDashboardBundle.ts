/**
 * Detect stale dashboard JS (PWA / runtime cache) and reload once after purge.
 * Bundled sha comes from Vite `__IAM_BUILD_GIT_SHA__`; remote from /pwa-build-meta.json.
 */

import { isPhoneViewport } from '../../lib/breakpoints';

declare const __IAM_BUILD_GIT_SHA__: string;

const SESSION_SHA_KEY = 'iam_dashboard_git_sha';
const RELOAD_GUARD_KEY = 'iam_dashboard_reload_guard';

function normalizeSha(raw: string): string {
  return String(raw || '').trim().slice(0, 12);
}

function shasMatch(a: string, b: string): boolean {
  const x = normalizeSha(a);
  const y = normalizeSha(b);
  if (!x || !y) return true;
  return x === y || x.startsWith(y.slice(0, 7)) || y.startsWith(x.slice(0, 7));
}

export async function purgeDashboardJsCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await Promise.all(
    ['iam-dashboard-js-v1', 'iam-dashboard-js-v2', 'iam-dashboard-js-v3'].map((name) =>
      caches.delete(name),
    ),
  );
}

/** Call once on dashboard boot (phone viewports reload aggressively). */
export async function ensureFreshDashboardBundle(): Promise<void> {
  if (typeof window === 'undefined') return;

  const isNarrow = isPhoneViewport();
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
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
      return;
    }

    const prevSha = sessionStorage.getItem(SESSION_SHA_KEY);
    sessionStorage.setItem(SESSION_SHA_KEY, remoteSha);

    const stale = bundledSha && !shasMatch(bundledSha, remoteSha);
    const remoteChanged = prevSha && prevSha !== remoteSha;
    const shouldReload = stale || (isNarrow && remoteChanged);

    if (!shouldReload) return;
    if (sessionStorage.getItem(RELOAD_GUARD_KEY) === remoteSha) return;

    sessionStorage.setItem(RELOAD_GUARD_KEY, remoteSha);
    await purgeDashboardJsCaches();
    window.location.reload();
  } catch {
    /* non-fatal */
  }
}
