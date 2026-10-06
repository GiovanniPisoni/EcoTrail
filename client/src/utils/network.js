import { ref } from 'vue'

export const OFFLINE_HEADER = 'x-offline-cache'

// True when the browser reports no connection or the last data came from the offline cache
export const isOffline = ref(typeof navigator !== 'undefined' && navigator.onLine === false)

let servedFromCache = false

function update() {
  isOffline.value = navigator.onLine === false || servedFromCache
}

export function markResponse(headers) {
  const fromCache = Boolean(headers?.[OFFLINE_HEADER])
  if (fromCache === servedFromCache) return
  servedFromCache = fromCache
  update()
}

window.addEventListener('offline', update)
window.addEventListener('online', () => {
  servedFromCache = false
  update()
})
