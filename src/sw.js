/* Service Worker: Offline-Cache der App und Push-Nachrichten */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'Rambo Zambo', body: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(d.title || 'Rambo Zambo', {
    body: d.body || '',
    icon: '/icons/rzk-icon-192.png',
    badge: '/icons/rzk-icon-192.png',
    tag: d.tag,
    data: { url: d.url || '/' }
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) { c.postMessage({ type: 'open', url }); return c.focus() }
    }
    return self.clients.openWindow(url)
  })())
})
