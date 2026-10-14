import api from '@/api/client.js'

export const PUSH_SUBSCRIPTION_CHANGED = 'push-subscription-changed'

const DISABLED_KEY = 'ecotrail_alerts_disabled_for'
const USER_KEY = 'ecotrail_user'
const RETRY_DELAYS_MS = [0, 2000, 5000]

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

function currentUserId() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY))?.id ?? null
  } catch {
    return null
  }
}

function alertsDisabled() {
  try {
    const id = currentUserId()
    return id !== null && localStorage.getItem(DISABLED_KEY) === String(id)
  } catch {
    return false
  }
}

function setAlertsDisabled(disabled) {
  try {
    if (disabled) localStorage.setItem(DISABLED_KEY, String(currentUserId()))
    else localStorage.removeItem(DISABLED_KEY)
  } catch {}
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export async function getExistingSubscription() {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function alertsAreOn() {
  if (!isPushSupported() || Notification.permission !== 'granted') return false
  return Boolean(await getExistingSubscription()) && !alertsDisabled()
}

function sameKey(subscription, key) {
  const current = subscription.options?.applicationServerKey
  if (!current) return true
  const bytes = new Uint8Array(current)
  return bytes.length === key.length && bytes.every((value, index) => value === key[index])
}

async function createSubscription(registration, applicationServerKey) {
  let lastError

  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))

    try {
      return await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      })
    } catch (err) {
      if (err.name !== 'AbortError') throw err
      lastError = err
    }
  }

  throw lastError
}

export async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready
  const { data } = await api.get('/push/public-key')
  const applicationServerKey = urlBase64ToUint8Array(data.publicKey)

  let subscription = await registration.pushManager.getSubscription()
  if (subscription && !sameKey(subscription, applicationServerKey)) {
    await subscription.unsubscribe()
    subscription = null
  }

  if (!subscription) subscription = await createSubscription(registration, applicationServerKey)

  await api.post('/push/subscribe', subscription.toJSON())
  setAlertsDisabled(false)
  window.dispatchEvent(new Event(PUSH_SUBSCRIPTION_CHANGED))
  return subscription
}

export async function syncPushSubscription() {
  if (!isPushSupported() || Notification.permission !== 'granted') return false
  if (alertsDisabled()) return false

  const subscription = await getExistingSubscription()
  if (!subscription) return false

  await api.post('/push/subscribe', subscription.toJSON())
  return true
}

export async function forgetPushSubscription() {
  try {
    if (!isPushSupported()) return
    const subscription = await getExistingSubscription()
    if (!subscription) return

    await api.post('/push/unsubscribe', { endpoint: subscription.endpoint })
  } catch {}
}

export async function unsubscribeFromPush() {
  const subscription = await getExistingSubscription()

  if (subscription) {
    try {
      await api.post('/push/unsubscribe', { endpoint: subscription.endpoint })
    } catch (err) {
      console.error('Could not tell the server that alerts are off:', err)
    }
  }

  setAlertsDisabled(true)
  window.dispatchEvent(new Event(PUSH_SUBSCRIPTION_CHANGED))
}
