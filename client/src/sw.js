import { precacheAndRoute } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'EcoTrail'
  const options = {
    body: data.body || '',
    icon: '/favicon.ico',
    data: { url: data.url || '/' }
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  const url = event.notification.data?.url || '/'
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      const client = windowClients.find((c) => 'focus' in c)

      if (client) {
        if (!('navigate' in client)) return client.focus()

        const navigated = await client.navigate(url).catch(() => null)
        if (navigated) return navigated.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
