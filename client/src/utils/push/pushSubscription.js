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

export async function syncPushSubscription() {
  if (!isPushSupported() || Notification.permission !== 'granted') return false

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
  if (!subscription) return

  try {
    await api.post('/push/unsubscribe', { endpoint: subscription.endpoint })
  } catch (err) {
    console.error('Could not tell the server that alerts are off:', err)
  }
  await subscription.unsubscribe()
  window.dispatchEvent(new Event(PUSH_SUBSCRIPTION_CHANGED))
}
