// Push handlers, pulled into the generated service worker via workbox.importScripts (see vite.config.ts).
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { /* ignore bad payloads */ }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Nudge', {
      body: d.body || '',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: d.tag, // one notification per channel; newer ones replace older
      renotify: Boolean(d.tag),
      data: { url: d.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.postMessage({ type: 'open-url', url })
          return w.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
