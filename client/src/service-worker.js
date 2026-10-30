import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

try {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
      denylist: [/^\/api\//, /^\/socket\.io\//]
    })
  )
} catch {}

const TILE_HOST = 'tile.openstreetmap.org'
const API_TIMEOUT_MS = 8000
const OFFLINE_HEADER = 'X-Offline-Cache'
const OFFLINE_DATA_CACHE = 'ecotrail-offline-data'
const TRAILS_KEY = '/__offline/trails'
const REPORTS_KEY = '/__offline/reports'

const isTileRequest = ({ url }) => url.hostname.endsWith(TILE_HOST)

const tilePlugins = [
  {
    requestWillFetch: async ({ request }) =>
      new Request(request.url, { mode: 'cors', credentials: 'omit' }),
    cacheKeyWillBeUsed: async ({ request }) => {
      const url = new URL(request.url)
      url.hostname = TILE_HOST
      return url.href
    }
  },
  new CacheableResponsePlugin({ statuses: [200] }),
  new ExpirationPlugin({
    maxEntries: 1500,
    maxAgeSeconds: 30 * 24 * 60 * 60,
    purgeOnQuotaError: true
  })
]

registerRoute(isTileRequest, new CacheFirst({ cacheName: 'osm-tiles', plugins: tilePlugins }))

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-styles' })
)
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-files',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 })
    ]
  })
)

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', [OFFLINE_HEADER]: '1' }
  })
}

async function readStored(key) {
  const cache = await caches.open(OFFLINE_DATA_CACHE)
  const response = await cache.match(key)
  return response ? response.json() : null
}

async function writeStored(key, data) {
  const cache = await caches.open(OFFLINE_DATA_CACHE)
  await cache.put(
    key,
    new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  )
}

let trailsWriteQueue = Promise.resolve()

function mergeTrails(incoming) {
  trailsWriteQueue = trailsWriteQueue
    .then(async () => {
      const stored = (await readStored(TRAILS_KEY)) || { type: 'FeatureCollection', features: [] }
      const byId = new Map(stored.features.map((f) => [String(f.properties.id), f]))
      incoming.features.forEach((f) => byId.set(String(f.properties.id), f))
      await writeStored(TRAILS_KEY, { type: 'FeatureCollection', features: [...byId.values()] })
    })
    .catch(() => {})
  return trailsWriteQueue
}

function offlineFirstApi({ storeKey, store }) {
  return async ({ request, event }) => {
    try {
      const response = await fetch(request, { signal: AbortSignal.timeout(API_TIMEOUT_MS) })
      if (response.ok) event.waitUntil(response.clone().json().then(store))
      return response
    } catch (err) {
      const stored = await readStored(storeKey)
      if (stored) return jsonResponse(stored)
      throw err
    }
  }
}

registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname === '/api/trails',
  offlineFirstApi({ storeKey: TRAILS_KEY, store: mergeTrails })
)

registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname === '/api/reports',
  offlineFirstApi({ storeKey: REPORTS_KEY, store: (data) => writeStored(REPORTS_KEY, data) })
)

registerRoute(
  ({ url, request }) =>
    request.method === 'GET' && /^\/api\/trails\/[a-f0-9]{24}$/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'trail-details',
    networkTimeoutSeconds: 8,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 })
    ]
  })
)

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
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windowClients) => {
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
