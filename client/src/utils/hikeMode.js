import { ref } from 'vue'
import api from '@/api/client.js'

export const MIN_DISTANCE_METERS = 30
export const MAX_SEND_INTERVAL_MS = 60 * 1000
export const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000
const STORAGE_KEY = 'ecotrail:hike-mode'
const TICK_INTERVAL_MS = 15 * 1000
const EARTH_RADIUS_METERS = 6371000

export const hikeModeActive = ref(false)
export const hikeModeError = ref('')
export const hikeModeStopReason = ref('')

let watchId = null
let tickTimer = null
let latest = null
let lastSent = null
let movementAnchor = null
let lastMovedAt = 0
let wakeLock = null

export function isGeolocationSupported() {
  return 'geolocation' in navigator
}

function setStoredFlag(enabled) {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

function hasStoredFlag() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return

  try {
    wakeLock = await navigator.wakeLock.request('screen')
    wakeLock.addEventListener('release', () => {
      wakeLock = null
    })
  } catch (err) {
    console.error('Failed to keep the screen awake:', err)
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {})
  wakeLock = null
}

export function distanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

async function sendPosition(point) {
  lastSent = { ...point, at: Date.now() }

  try {
    await api.post('/presence', { latitude: point.latitude, longitude: point.longitude })
  } catch (err) {
    console.error('Failed to send the current position:', err)
  }
}

function handlePosition(position) {
  const { latitude, longitude } = position.coords
  latest = { latitude, longitude }
  hikeModeError.value = ''

  if (!movementAnchor || distanceMeters(movementAnchor, latest) >= MIN_DISTANCE_METERS) {
    movementAnchor = latest
    lastMovedAt = Date.now()
  }

  if (!lastSent || distanceMeters(lastSent, latest) >= MIN_DISTANCE_METERS) {
    sendPosition(latest)
  }
}

function handleError(error) {
  if (error.code === error.PERMISSION_DENIED) {
    hikeModeError.value =
      "Location access is blocked. Allow it in your browser's site settings to use hike mode."
    stopHikeMode()
    return
  }

  hikeModeError.value = 'Your position is temporarily unavailable.'
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible' || !hikeModeActive.value) return

  acquireWakeLock()
  if (latest) sendPosition(latest)
}

function handleOnline() {
  if (latest) sendPosition(latest)
}

function tick() {
  const now = Date.now()

  if (now - lastMovedAt >= INACTIVITY_TIMEOUT_MS) {
    stopHikeMode('inactivity')
    return
  }

  if (latest && lastSent && now - lastSent.at >= MAX_SEND_INTERVAL_MS) {
    sendPosition(latest)
  }
}

export function startHikeMode() {
  if (hikeModeActive.value) return

  hikeModeError.value = ''
  hikeModeStopReason.value = ''

  if (!isGeolocationSupported()) {
    hikeModeError.value = 'Your browser does not support geolocation.'
    return
  }

  lastMovedAt = Date.now()
  watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 20000
  })
  tickTimer = setInterval(tick, TICK_INTERVAL_MS)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('online', handleOnline)
  acquireWakeLock()
  setStoredFlag(true)
  hikeModeActive.value = true
}

export async function resumeHikeModeIfEnabled() {
  if (hikeModeActive.value || !hasStoredFlag()) return

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    if (status.state === 'granted') {
      startHikeMode()
      return
    }
  } catch {}

  setStoredFlag(false)
}

export function stopHikeMode(reason = '') {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  if (tickTimer !== null) clearInterval(tickTimer)

  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('online', handleOnline)
  releaseWakeLock()
  setStoredFlag(false)

  watchId = null
  tickTimer = null
  latest = null
  lastSent = null
  movementAnchor = null
  hikeModeActive.value = false
  hikeModeStopReason.value = reason
}
