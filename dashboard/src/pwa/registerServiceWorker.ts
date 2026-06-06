/**
 * Register dashboard PWA service worker after session is confirmed (not on /auth/*).
 */

const SW_URL = '/sw.js';
const SERVICES_MANIFEST_URL = 'https://services.inneranimalmedia.com/sw/manifest.json';
const CACHE_BUST_STORAGE_KEY = 'iam_sw_cache_bust';
const TIER2_TABS_SESSION_KEY = 'iam_sw_tier2_tabs';
const MANIFEST_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

const AUTH_PREFIXES = ['/auth/login', '/auth/signup', '/auth/reset', '/auth/forgot'];

type ServicesSwManifest = {
  cache_bust?: string;
  tier2_tabs?: Record<string, string[]>;
};

let manifestPollTimer: ReturnType<typeof setInterval> | null = null;

function onAuthSurface(): boolean {
  const p = window.location.pathname.toLowerCase();
  return AUTH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

function storeTier2Tabs(manifest: ServicesSwManifest): void {
  if (!manifest.tier2_tabs || typeof manifest.tier2_tabs !== 'object') return;
  try {
    sessionStorage.setItem(TIER2_TABS_SESSION_KEY, JSON.stringify(manifest.tier2_tabs));
  } catch {
    /* optional control-plane cache */
  }
}

function checkCacheBustAndNotify(manifest: ServicesSwManifest): void {
  const next = String(manifest.cache_bust || '').trim();
  if (!next) return;

  try {
    const prev = localStorage.getItem(CACHE_BUST_STORAGE_KEY);
    if (prev && prev !== next) {
      window.dispatchEvent(new CustomEvent('iam-pwa-update-available'));
    }
    localStorage.setItem(CACHE_BUST_STORAGE_KEY, next);
  } catch {
    /* optional control-plane cache */
  }
}

async function pollServicesManifest(): Promise<void> {
  try {
    const res = await fetch(SERVICES_MANIFEST_URL, { cache: 'no-store', mode: 'cors' });
    if (!res.ok) return;
    const manifest = (await res.json()) as ServicesSwManifest;
    storeTier2Tabs(manifest);
    checkCacheBustAndNotify(manifest);
  } catch {
    /* optional control-plane poll */
  }
}

function startManifestPoll(): void {
  if (manifestPollTimer != null) return;
  manifestPollTimer = setInterval(() => {
    void pollServicesManifest();
  }, MANIFEST_POLL_INTERVAL_MS);
}

function triggerTier1Warm(): void {
  try {
    const controller = navigator.serviceWorker.controller;
    if (controller) {
      controller.postMessage({ type: 'IAM_TIER1_WARM' });
      return;
    }
    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: 'IAM_TIER1_WARM' });
    });
  } catch {
    /* best-effort tier-1 warm */
  }
}

export async function registerIamServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (onAuthSurface()) return;

  try {
    const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent('iam-pwa-update-available'));
        }
      });
    });

    void pollServicesManifest();
    triggerTier1Warm();
    startManifestPoll();
  } catch (err) {
    console.warn('[pwa] service worker registration failed', err);
  }
}

export async function subscribeIamWebPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await syncPushSubscription(existing);
    return true;
  }

  let vapidPublicKey = '';
  try {
    const res = await fetch('/api/push/vapid-public-key', { credentials: 'same-origin' });
    if (res.ok) {
      const data = (await res.json()) as { publicKey?: string };
      vapidPublicKey = String(data.publicKey || '').trim();
    }
  } catch {
    return false;
  }

  if (!vapidPublicKey) return false;

  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  await syncPushSubscription(sub);
  return true;
}

async function syncPushSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await fetch('/api/push/subscribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
