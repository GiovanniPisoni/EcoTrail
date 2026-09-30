<script setup>
import { ref } from 'vue'

const log = ref([])
const token = ref('')

function addLog(message) {
  log.value.push(message)
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

async function login() {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hiker@ecotrail.test', password: 'hiker123' })
  })
  const data = await res.json()

  if (!res.ok) {
    addLog(`Login failed: ${data.error}`)
    return
  }

  token.value = data.token
  addLog('Login successful, token obtained.')
}

async function registerServiceWorker() {
  const { registerSW } = await import('virtual:pwa-register')
  registerSW({ immediate: true })
  const registration = await navigator.serviceWorker.ready
  addLog('Service Worker registered.')
  return registration
}

async function subscribe() {
  if (!token.value) {
    addLog('Log in first (step 1).')
    return
  }

  const registration = await navigator.serviceWorker.ready

  const permission = await Notification.requestPermission()
  addLog(`Notification permission: ${permission}`)
  if (permission !== 'granted') {
    addLog('Permission denied, cannot subscribe.')
    return
  }

  const keyRes = await fetch('/api/push/public-key')
  const { publicKey } = await keyRes.json()

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  })

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.value}`
    },
    body: JSON.stringify(subscription.toJSON())
  })
  const data = await res.json()

  addLog(res.ok ? 'Subscription saved on the server.' : `Subscription error: ${data.error}`)
}

async function sendTest() {
  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.value}` }
  })
  const data = await res.json()

  addLog(res.ok ? 'Test notification sent by the server.' : `Send error: ${data.error}`)
}
</script>

<template>
  <div>
    <h2>Push notifications technical test</h2>
    <ol>
      <li><button @click="login">Log in as test user</button></li>
      <li><button @click="registerServiceWorker">Register Service Worker</button></li>
      <li><button @click="subscribe">Request permission and subscribe</button></li>
      <li><button @click="sendTest">Send test notification</button></li>
    </ol>

    <h3>Log</h3>
    <ul>
      <li v-for="(entry, i) in log" :key="i">{{ entry }}</li>
    </ul>
  </div>
</template>
