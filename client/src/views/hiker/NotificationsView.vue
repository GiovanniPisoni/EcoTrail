<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import api from '@/api/client.js'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import NotificationPermissionHelp from '@/components/notifications/NotificationPermissionHelp.vue'
import NotificationToggle from '@/components/notifications/NotificationToggle.vue'
import {
  MUTE_LABELS,
  NOTIFICATION_TYPES,
  formatRadius,
  getNotificationTypeLabel
} from '@/config/notificationTypes.js'
import {
  PUSH_SUBSCRIPTION_CHANGED,
  getExistingSubscription,
  isPushSupported
} from '@/utils/push/pushSubscription.js'
import { unreadNotificationCount } from '@/utils/push/notifications.js'

const PAGE_SIZE = 20

const router = useRouter()

const supported = ref(true)
const permission = ref('default')
const subscribed = ref(false)

const preferences = ref(null)
const preferencesError = ref('')
const savingPreferences = ref(false)

const notifications = ref([])
const hasMore = ref(false)
const loading = ref(true)
const loadingMore = ref(false)
const markingAll = ref(false)
const historyError = ref('')

const mutedUntilLabel = computed(() =>
  preferences.value?.mutedUntil ? new Date(preferences.value.mutedUntil).toLocaleString() : ''
)
const isMuted = computed(
  () => preferences.value?.mutedIndefinitely || Boolean(preferences.value?.mutedUntil)
)

function formatSentAt(isoDate) {
  return new Date(isoDate).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function refreshPermission() {
  supported.value = isPushSupported()
  if (!supported.value) return

  permission.value = Notification.permission
  subscribed.value = permission.value === 'granted' && !!(await getExistingSubscription())
}

async function loadPreferences() {
  try {
    const { data } = await api.get('/notifications/preferences')
    preferences.value = data
  } catch (err) {
    preferencesError.value = 'Could not load your preferences.'
    console.error('Failed to load notification preferences:', err)
  }
}

async function savePreferences(change) {
  savingPreferences.value = true
  preferencesError.value = ''

  try {
    const { data } = await api.patch('/notifications/preferences', change)
    preferences.value = data
  } catch (err) {
    preferencesError.value = 'Could not save your preferences. Please try again.'
    console.error('Failed to save notification preferences:', err)
    await loadPreferences()
  } finally {
    savingPreferences.value = false
  }
}

function toggleAlertType(type) {
  const selected = new Set(preferences.value.alertTypes)
  if (selected.has(type)) selected.delete(type)
  else selected.add(type)

  savePreferences({ alertTypes: [...selected] })
}

async function loadHistory({ more = false } = {}) {
  historyError.value = ''
  if (more) loadingMore.value = true

  try {
    const params = { limit: PAGE_SIZE }
    if (more) params.before = notifications.value.at(-1).sentAt

    const { data } = await api.get('/notifications', { params })
    notifications.value = more
      ? [...notifications.value, ...data.notifications]
      : data.notifications
    hasMore.value = data.hasMore
    unreadNotificationCount.value = data.unreadCount
  } catch (err) {
    historyError.value = 'Could not load your notifications.'
    console.error('Failed to load notifications:', err)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function markRead(notification) {
  if (notification.readAt) return

  try {
    const { data } = await api.patch(`/notifications/${notification.id}/read`)
    notification.readAt = data.readAt
    unreadNotificationCount.value = Math.max(0, unreadNotificationCount.value - 1)
  } catch (err) {
    console.error('Failed to mark the notification as read:', err)
  }
}

async function open(notification) {
  await markRead(notification)
  if (notification.url) router.push(notification.url)
}

async function markAllRead() {
  markingAll.value = true

  try {
    await api.patch('/notifications/read-all')
    const now = new Date().toISOString()
    notifications.value.forEach((notification) => {
      notification.readAt ??= now
    })
    unreadNotificationCount.value = 0
  } catch (err) {
    historyError.value = 'Could not mark your notifications as read.'
    console.error('Failed to mark all notifications as read:', err)
  } finally {
    markingAll.value = false
  }
}

onMounted(() => {
  refreshPermission()
  window.addEventListener(PUSH_SUBSCRIPTION_CHANGED, refreshPermission)
  loadPreferences()
  loadHistory()
})

onBeforeUnmount(() => window.removeEventListener(PUSH_SUBSCRIPTION_CHANGED, refreshPermission))
</script>

<template>
  <main class="notifications-page">
    <BaseCard class="notifications-page__section">
      <div class="notifications-page__header">
        <h1 class="notifications-page__title">Notifications</h1>
        <RouterLink to="/" class="notifications-page__close" title="Back to map">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </RouterLink>
      </div>

      <div v-if="!supported" class="notifications-page__status">
        <p>This browser doesn't support push notifications, so alerts can't reach you here.</p>
      </div>
      <div
        v-else-if="permission === 'denied'"
        class="notifications-page__status notifications-page__status--warning"
      >
        <h2 class="notifications-page__status-title">Notifications are blocked</h2>
        <NotificationPermissionHelp />
      </div>
      <div v-else-if="subscribed" class="notifications-page__status">
        <p>Push notifications are on for this device, even when the app is closed.</p>
        <NotificationToggle />
      </div>
      <div v-else class="notifications-page__status">
        <p>Push notifications are off on this device.</p>
        <NotificationToggle />
      </div>
    </BaseCard>

    <BaseCard class="notifications-page__section">
      <h2 class="notifications-page__section-title">Preferences</h2>

      <p v-if="!preferences && !preferencesError" class="notifications-page__empty">Loading…</p>
      <p v-if="preferencesError" class="notifications-page__error">{{ preferencesError }}</p>

      <template v-if="preferences">
        <label class="notifications-page__field">
          <span>Alert me when I'm within</span>
          <select
            :value="preferences.radiusMeters"
            :disabled="savingPreferences"
            @change="savePreferences({ radiusMeters: Number($event.target.value) })"
          >
            <option
              v-for="meters in preferences.options.radiusMeters"
              :key="meters"
              :value="meters"
            >
              {{ formatRadius(meters) }}
            </option>
          </select>
        </label>

        <fieldset class="notifications-page__types">
          <legend>Alerts I want to receive</legend>
          <label
            v-for="type in preferences.options.alertTypes"
            :key="type"
            class="notifications-page__type"
          >
            <input
              type="checkbox"
              :checked="preferences.alertTypes.includes(type)"
              :disabled="savingPreferences"
              @change="toggleAlertType(type)"
            />
            <span>
              <strong>{{ NOTIFICATION_TYPES[type]?.label ?? type }}</strong>
              <small>{{ NOTIFICATION_TYPES[type]?.description }}</small>
            </span>
          </label>
        </fieldset>

        <div class="notifications-page__mute">
          <template v-if="isMuted">
            <p class="notifications-page__muted">
              <template v-if="preferences.mutedIndefinitely">
                Alerts are silenced until you turn them back on.
              </template>
              <template v-else>Alerts are silenced until {{ mutedUntilLabel }}.</template>
              They still appear below, but you won't get a push.
            </p>
            <BaseButton
              variant="secondary"
              :disabled="savingPreferences"
              @click="savePreferences({ mute: null })"
            >
              Turn alerts back on
            </BaseButton>
          </template>
          <template v-else>
            <span class="notifications-page__mute-label">Silence alerts</span>
            <div class="notifications-page__mute-options">
              <BaseButton
                v-for="minutes in preferences.options.muteMinutes"
                :key="minutes"
                variant="secondary"
                :disabled="savingPreferences"
                @click="savePreferences({ mute: minutes })"
              >
                {{ MUTE_LABELS[minutes] ?? `${minutes} min` }}
              </BaseButton>
              <BaseButton
                variant="secondary"
                :disabled="savingPreferences"
                @click="savePreferences({ mute: 'indefinite' })"
              >
                Until I turn them back on
              </BaseButton>
            </div>
          </template>
        </div>
      </template>
    </BaseCard>

    <section class="notifications-page__history">
      <div class="notifications-page__history-header">
        <h2 class="notifications-page__section-title">History</h2>
        <BaseButton
          v-if="unreadNotificationCount > 0"
          variant="secondary"
          :disabled="markingAll"
          @click="markAllRead"
        >
          Mark all as read
        </BaseButton>
      </div>

      <p v-if="loading" class="notifications-page__empty">Loading…</p>
      <p v-else-if="historyError && notifications.length === 0" class="notifications-page__error">
        {{ historyError }}
      </p>
      <p v-else-if="notifications.length === 0" class="notifications-page__empty">
        No notifications yet. Alerts about trails near you will show up here.
      </p>

      <ul v-else class="notifications-page__list">
        <li v-for="notification in notifications" :key="notification.id">
          <button
            type="button"
            class="notifications-page__item"
            :class="{ 'notifications-page__item--unread': !notification.readAt }"
            @click="open(notification)"
          >
            <span class="notifications-page__item-top">
              <span class="notifications-page__item-type">{{
                getNotificationTypeLabel(notification.type)
              }}</span>
              <span class="notifications-page__item-date">{{
                formatSentAt(notification.sentAt)
              }}</span>
            </span>
            <span class="notifications-page__item-title">{{ notification.title }}</span>
            <span v-if="notification.body" class="notifications-page__item-body">{{
              notification.body
            }}</span>
          </button>
        </li>
      </ul>

      <p v-if="historyError && notifications.length > 0" class="notifications-page__error">
        {{ historyError }}
      </p>
      <BaseButton
        v-if="hasMore"
        variant="secondary"
        :disabled="loadingMore"
        @click="loadHistory({ more: true })"
      >
        {{ loadingMore ? 'Loading…' : 'Load older' }}
      </BaseButton>
    </section>
  </main>
</template>

<style scoped>
.notifications-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.notifications-page__section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.notifications-page__header,
.notifications-page__history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.notifications-page__title {
  margin: 0;
  font-size: 1.4rem;
}

.notifications-page__section-title {
  margin: 0;
  font-size: 1.1rem;
}

.notifications-page__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-pill);
  color: var(--color-text-muted);
}

.notifications-page__close:hover {
  background: var(--color-background);
  color: var(--color-primary);
}

.notifications-page__close svg {
  width: 20px;
  height: 20px;
}

.notifications-page__status p {
  margin: 0;
  font-size: 0.9rem;
}

.notifications-page__status--warning {
  padding: 0.75rem 1rem;
  border-radius: var(--radius-card, 12px);
  background: rgba(220, 70, 70, 0.1);
}

.notifications-page__status-title {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.notifications-page__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
}

.notifications-page__field select {
  padding: 0.5rem 0.75rem;
  border: 1px solid rgba(26, 62, 47, 0.25);
  border-radius: 8px;
  font: inherit;
  background: var(--color-surface);
}

.notifications-page__types {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.notifications-page__types legend {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.notifications-page__type {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  cursor: pointer;
}

.notifications-page__type span {
  display: flex;
  flex-direction: column;
}

.notifications-page__type small {
  color: var(--color-text-muted);
}

.notifications-page__mute {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.notifications-page__mute-label {
  font-size: 0.9rem;
}

.notifications-page__mute-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.notifications-page__muted {
  margin: 0;
  font-size: 0.9rem;
}

.notifications-page__history {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.notifications-page__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.notifications-page__item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.75rem 1rem;
  text-align: left;
  border: 1px solid rgba(26, 62, 47, 0.12);
  border-radius: 12px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.notifications-page__item:hover {
  border-color: var(--color-primary);
}

.notifications-page__item--unread {
  border-left: 4px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
}

.notifications-page__item-top {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.notifications-page__item-type {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.notifications-page__item-title {
  font-weight: 600;
}

.notifications-page__item-body {
  font-size: 0.9rem;
}

.notifications-page__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.notifications-page__error {
  margin: 0;
  color: #c0392b;
  font-size: 0.9rem;
}
</style>
