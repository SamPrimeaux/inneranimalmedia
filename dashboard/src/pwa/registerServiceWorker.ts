/**
 * Register dashboard PWA service worker after session is confirmed (not on /auth/*).
 */

const SW_URL = '/sw.js';
const AUTH_PREFIXES = ['/auth/login', '/auth/signup', '/auth/reset', '/auth/forgot'];

function onAuthSurface(): boolean {
  const p = window.location.pathname.toLowerCase();
  return AUTH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

async function pollServicesManifest(): Promise<void> {
  try {
    await fetch('https://services.inneranimalmedia.com/sw/manifest.json', {
      cache: 'no-store',
      mode: 'cors',
    });
  } catch {
    /* optional control-plane poll */
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
