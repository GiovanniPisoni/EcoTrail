import api from '@/api/client.js'

export const PUSH_SUBSCRIPTION_CHANGED = 'push-subscription-changed'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export async function getExistingSubscription() {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready
  const { data } = await api.get('/push/public-key')

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey)
  })

  await api.post('/push/subscribe', subscription.toJSON())
  window.dispatchEvent(new Event(PUSH_SUBSCRIPTION_CHANGED))
  return subscription
}

// The browser keeps its subscription when the person logs out or switches account, so the server
// has to be told again who owns it each time the app opens.
export async function syncPushSubscription() {
  if (!isPushSupported() || Notification.permission !== 'granted') return false

  const subscription = await getExistingSubscription()
  if (!subscription) return false

  await api.post('/push/subscribe', subscription.toJSON())
  return true
}

// Stops the current account from getting alerts on this device, keeping the browser subscription so
// the next account that logs in can claim it. Best effort: it must never block a logout.
export async function forgetPushSubscription() {
  try {
    if (!isPushSupported()) return
    const subscription = await getExistingSubscription()
    if (!subscription) return

    await api.delete('/push/subscribe', { data: { endpoint: subscription.endpoint } })
  } catch {
    // the server may not know this device for this account, or be unreachable
  }
}

export async function unsubscribeFromPush() {
  const subscription = await getExistingSubscription()
  if (!subscription) return

  try {
    await api.delete('/push/subscribe', { data: { endpoint: subscription.endpoint } })
  } catch (err) {
    // The server does not have it for this account (it was registered by another one): turning
    // alerts off must still work, so the browser subscription is removed anyway.
    if (err.response?.status !== 404) throw err
  }
  await subscription.unsubscribe()
}
