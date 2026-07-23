/* Web Push display — imported by Workbox-generated /sw.js */

function resolvePushTargetUrl(raw) {
  const fallback = '/dashboard/agent';
  try {
    return new URL(String(raw || fallback), self.location.origin).href;
  } catch (_) {
    return new URL(fallback, self.location.origin).href;
  }
}

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Inner Animal Media',
    body: '',
    url: '/dashboard/agent',
    tag: 'iam',
    notificationId: null,
    entityType: null,
    entityId: null,
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = {
          title: parsed.title || payload.title,
          body: parsed.body || '',
          url: parsed.url || payload.url,
          tag: parsed.tag || payload.tag,
          notificationId: parsed.notificationId || parsed.notification_id || null,
          entityType: parsed.entityType || parsed.entity_type || null,
          entityId: parsed.entityId || parsed.entity_id || null,
        };
      }
    }
  } catch (_) {
    /* show default notification */
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: {
        url: payload.url,
        notificationId: payload.notificationId,
        entityType: payload.entityType,
        entityId: payload.entityId,
      },
      icon: '/static/dashboard/app/pwa/icon-192.png',
      badge: '/static/dashboard/app/pwa/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const targetUrl = resolvePushTargetUrl(data.url || '/dashboard/agent');
  const notificationId = data.notificationId || null;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const origin = self.location.origin;

      for (const client of windowClients) {
        if (!String(client.url || '').startsWith(origin)) continue;

        // Prefer navigate so the SPA lands on the deep link; always postMessage
        // so React Router can sync when navigate is a no-op or unsupported.
        try {
          if (typeof client.navigate === 'function') {
            await client.navigate(targetUrl);
          }
        } catch (_) {
          /* fall through to postMessage */
        }

        try {
          client.postMessage({
            type: 'IAM_PUSH_NAVIGATE',
            url: targetUrl,
            notificationId,
          });
        } catch (_) {
          /* ignore */
        }

        if (typeof client.focus === 'function') {
          await client.focus();
        }
        return;
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
