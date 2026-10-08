<script setup>
import { computed, ref } from 'vue'
import { isPushSupported, subscribeToPush } from '@/utils/push/pushSubscription.js'
import {
  INACTIVITY_TIMEOUT_MS,
  hikeModeActive,
  hikeModeError,
  hikeModeStopReason,
  isGeolocationSupported,
  startHikeMode,
  stopHikeMode
} from '@/utils/hikeMode.js'

const supported = isGeolocationSupported()
const explaining = ref(false)
const offerAlerts = ref(false)
const enableAlerts = ref(true)
const starting = ref(false)

const inactivityHours = INACTIVITY_TIMEOUT_MS / 3600000

const notice = computed(() => {
  if (hikeModeError.value) return hikeModeError.value
  if (hikeModeStopReason.value === 'inactivity') {
    return `Hike mode turned off after ${inactivityHours} hours without movement.`
  }
  return ''
})

function openExplanation() {
  hikeModeError.value = ''
  hikeModeStopReason.value = ''

  offerAlerts.value = isPushSupported() && Notification.permission === 'default'
  explaining.value = true
}

async function confirmStart() {
  starting.value = true

  if (offerAlerts.value && enableAlerts.value) {
    try {
      const result = await Notification.requestPermission()
      if (result === 'granted') {
        subscribeToPush().catch((err) => console.error('Failed to enable push notifications:', err))
      }
    } catch (err) {
      console.error('Failed to enable push notifications:', err)
    }
  }

  startHikeMode()
  starting.value = false
  explaining.value = false
}

function dismissNotice() {
  hikeModeError.value = ''
  hikeModeStopReason.value = ''
}
</script>

<template>
  <div v-if="supported" class="hike-mode">
    <p v-if="notice && !hikeModeActive" class="hike-mode__notice" role="status">
      <span>{{ notice }}</span>
      <button type="button" class="hike-mode__notice-close" title="Dismiss" @click="dismissNotice">
        &times;
      </button>
    </p>

    <button
      v-if="hikeModeActive"
      type="button"
      class="hike-mode__button hike-mode__button--active"
      title="Tap to stop sharing your position"
      @click="stopHikeMode()"
    >
      <span class="hike-mode__dot" />
      Hike mode on
    </button>

    <button v-else type="button" class="hike-mode__button" @click="openExplanation">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
      I'm walking
    </button>

    <Teleport to="body" v-if="explaining">
      <div class="hike-mode__backdrop" @click.self="explaining = false">
        <div class="hike-mode__dialog">
          <h2>Start hike mode</h2>
          <p>
            While hike mode is on, EcoTrail shares your position with the server so it can warn you
            about risky or crowded trails near you. Your position is used only for these alerts:
            only your latest position is kept, never your route.
          </p>
          <p>
            Browsers stop sharing the position when the screen is off or the app is closed, so
            EcoTrail keeps your screen awake while hike mode is on (this uses more battery). Hike
            mode stays on across pages and reloads, and turns off by itself after
            {{ inactivityHours }} hours without movement or when you log out.
          </p>
          <label v-if="offerAlerts" class="hike-mode__option">
            <input v-model="enableAlerts" type="checkbox" />
            Also turn on trail alerts, to be notified even when the app is closed
          </label>
          <div class="hike-mode__dialog-actions">
            <button type="button" class="hike-mode__cancel" @click="explaining = false">
              Not now
            </button>
            <button
              type="button"
              class="hike-mode__confirm"
              :disabled="starting"
              @click="confirmStart"
            >
              {{ starting ? 'Starting…' : 'Start hike mode' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.hike-mode {
  position: absolute;
  right: 16px;
  bottom: 80px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  max-width: calc(100% - 32px);
}

.hike-mode__button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 44px;
  padding: 0 1rem;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-primary);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.9rem;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.25);
  cursor: pointer;
}

.hike-mode__button:hover {
  background: var(--color-background);
}

.hike-mode__button svg {
  width: 18px;
  height: 18px;
}

.hike-mode__button--active {
  background: var(--color-status-open);
  color: var(--color-surface);
}

.hike-mode__button--active:hover {
  background: var(--color-status-open);
  filter: brightness(0.95);
}

.hike-mode__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-surface);
  animation: hike-mode-pulse 1.6s ease-in-out infinite;
}

@keyframes hike-mode-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.7);
  }
}

.hike-mode__notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  max-width: 280px;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.8rem;
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.25);
}

.hike-mode__notice-close {
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-muted);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.hike-mode__backdrop {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(20, 30, 25, 0.45);
}

.hike-mode__dialog {
  width: 100%;
  max-width: 420px;
  padding: 1.5rem;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}

.hike-mode__dialog h2 {
  margin: 0 0 0.6rem;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.2rem;
}

.hike-mode__dialog p {
  margin: 0 0 0.6rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.hike-mode__option {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 0.8rem;
  font-size: 0.88rem;
  color: var(--color-text);
}

.hike-mode__dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.2rem;
}

.hike-mode__cancel {
  padding: 0.6rem 1rem;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  cursor: pointer;
}

.hike-mode__confirm {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-surface);
  font-family: var(--font-body);
  font-weight: 600;
  cursor: pointer;
}

.hike-mode__confirm:hover {
  background: var(--color-primary-pressed);
}

.hike-mode__confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .hike-mode {
    bottom: 78px;
  }
}
</style>
