<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import NotificationPermissionHelp from '@/components/notifications/NotificationPermissionHelp.vue'
import {
  PUSH_SUBSCRIPTION_CHANGED,
  alertsAreOn,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush
} from '@/utils/push/pushSubscription.js'

const supported = ref(true)
const permission = ref('default')
const subscribed = ref(false)
const loading = ref(false)
const error = ref('')
const explaining = ref(false)
const showBlockedHelp = ref(false)

async function refreshState() {
  permission.value = Notification.permission
  subscribed.value = await alertsAreOn()
}

onMounted(async () => {
  supported.value = isPushSupported()
  if (!supported.value) return

  await refreshState()
  window.addEventListener(PUSH_SUBSCRIPTION_CHANGED, refreshState)
})

onBeforeUnmount(() => window.removeEventListener(PUSH_SUBSCRIPTION_CHANGED, refreshState))

function describeError(err) {
  if (err.response) return `server answered ${err.response.status}`
  if (err.name === 'AbortError') return 'the notification service did not answer, wait a minute'
  return [err.name, err.message].filter(Boolean).join(': ').slice(0, 90)
}

async function enable() {
  loading.value = true
  error.value = ''

  try {
    const result = await Notification.requestPermission()
    permission.value = result

    if (result === 'granted') {
      await subscribeToPush()
      subscribed.value = true
    }
  } catch (err) {
    error.value = `Could not enable trail alerts (${describeError(err)}). Please try again.`
    console.error('Failed to enable push notifications:', err)
  } finally {
    loading.value = false
    explaining.value = false
  }
}

async function disable() {
  loading.value = true
  error.value = ''

  try {
    await unsubscribeFromPush()
    subscribed.value = false
  } catch (err) {
    error.value = `Could not turn off trail alerts (${describeError(err)}). Please try again.`
    console.error('Failed to disable push notifications:', err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div v-if="supported" class="notification-toggle">
    <button
      v-if="subscribed"
      type="button"
      class="notification-toggle__button notification-toggle__button--active"
      :disabled="loading"
      title="Turn off trail alerts"
      @click="disable"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      Trail alerts on
    </button>

    <button
      v-else-if="permission !== 'denied'"
      type="button"
      class="notification-toggle__button"
      :disabled="loading"
      @click="explaining = true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      Enable trail alerts
    </button>

    <button
      v-else
      type="button"
      class="notification-toggle__button notification-toggle__button--denied"
      @click="showBlockedHelp = true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </svg>
      Trail alerts blocked
    </button>

    <p v-if="error" class="notification-toggle__error">{{ error }}</p>

    <Teleport to="body" v-if="explaining">
      <div class="notification-toggle__backdrop" @click.self="explaining = false">
        <div class="notification-toggle__dialog">
          <h2>Get notified about your trails</h2>
          <p>
            EcoTrail can send you a notification when a trail you're near turns risky, closed or
            crowded — even if the app isn't open. We'll ask your browser for permission next.
          </p>
          <div class="notification-toggle__dialog-actions">
            <button type="button" class="notification-toggle__cancel" @click="explaining = false">
              Not now
            </button>
            <button
              type="button"
              class="notification-toggle__confirm"
              :disabled="loading"
              @click="enable"
            >
              {{ loading ? 'Enabling…' : 'Enable alerts' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body" v-if="showBlockedHelp">
      <div class="notification-toggle__backdrop" @click.self="showBlockedHelp = false">
        <div class="notification-toggle__dialog">
          <h2>Trail alerts are blocked</h2>
          <NotificationPermissionHelp />
          <div class="notification-toggle__dialog-actions">
            <button
              type="button"
              class="notification-toggle__cancel"
              @click="showBlockedHelp = false"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.notification-toggle {
  display: flex;
  align-items: center;
}

.notification-toggle__button {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 0.4rem;
  padding: 0.4rem 0.8rem;
  white-space: nowrap;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-primary);
  font-family: var(--font-body);
  font-size: 0.85rem;
  cursor: pointer;
}

.notification-toggle__button:hover {
  background-color: var(--color-background);
}

.notification-toggle__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.notification-toggle__button svg {
  width: 16px;
  height: 16px;
}

.notification-toggle__button--active {
  border-color: var(--color-status-open, #10b981);
  color: var(--color-status-open, #10b981);
}

.notification-toggle__button--denied {
  border-color: var(--color-text-muted);
  color: var(--color-text-muted);
}

.notification-toggle__error {
  margin: 0.3rem 0 0;
  font-size: 0.78rem;
  color: #ef4444;
}

.notification-toggle__backdrop {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(20, 30, 25, 0.45);
}

.notification-toggle__dialog {
  width: 100%;
  max-width: 400px;
  padding: 1.5rem;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}

.notification-toggle__dialog h2 {
  margin: 0 0 0.6rem;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.2rem;
}

.notification-toggle__dialog p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.notification-toggle__dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.2rem;
}

.notification-toggle__cancel {
  padding: 0.6rem 1rem;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  cursor: pointer;
}

.notification-toggle__confirm {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-surface);
  font-family: var(--font-body);
  font-weight: 600;
  cursor: pointer;
}

.notification-toggle__confirm:hover {
  background: var(--color-primary-pressed);
}

.notification-toggle__confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
