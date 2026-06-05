/* Web Push display — imported by Workbox-generated /sw.js */
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Inner Animal Media',
    body: '',
    url: '/dashboard/agent',
    tag: 'iam',
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
      data: { url: payload.url },
      icon: '/static/dashboard/app/pwa/icon-192.png',
      badge: '/static/dashboard/app/pwa/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/dashboard/agent';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
