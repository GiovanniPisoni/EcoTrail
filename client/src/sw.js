import { precacheAndRoute } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'EcoTrail'
  const options = {
    body: data.body || '',
    icon: '/favicon.ico'
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((windowClients) => {
      if (windowClients.length > 0) {
        return windowClients[0].focus()
      }
      return self.clients.openWindow('/')
    })
  )
})
