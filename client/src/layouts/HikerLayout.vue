<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import NotificationToggle from '@/components/notifications/NotificationToggle.vue'
import { hikeModeActive, resumeHikeModeIfEnabled, stopHikeMode } from '@/utils/hikeMode.js'
import {
  refreshUnreadNotificationCount,
  unreadNotificationCount
} from '@/utils/push/notifications.js'
import { startOfflineReports } from '@/utils/offline/offlineReports.js'
import { syncPushSubscription } from '@/utils/push/pushSubscription.js'

const UNREAD_REFRESH_INTERVAL_MS = 60 * 1000

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

let unreadTimer = null
let stopOfflineReports = null

function refreshWhenVisible() {
  if (document.visibilityState === 'visible') refreshUnreadNotificationCount()
}

onMounted(() => {
  resumeHikeModeIfEnabled()
  syncPushSubscription().catch((err) => console.error('Failed to sync the push subscription:', err))
  stopOfflineReports = startOfflineReports()
  refreshUnreadNotificationCount()
  unreadTimer = setInterval(refreshWhenVisible, UNREAD_REFRESH_INTERVAL_MS)
  document.addEventListener('visibilitychange', refreshWhenVisible)
})

onBeforeUnmount(() => {
  stopHikeMode()
  stopOfflineReports?.()
  clearInterval(unreadTimer)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
})

async function handleLogout() {
  stopHikeMode()
  await auth.endSession()
  router.push('/login')
}
</script>

<template>
  <div class="layout hiker-layout">
    <header class="layout-header">
      <span class="brand">EcoTrail</span>
      <nav>
        <button
          v-if="hikeModeActive && route.name !== 'hiker-home'"
          type="button"
          class="hike-pill"
          title="Tap to stop sharing your position"
          @click="stopHikeMode()"
        >
          Hike mode on
        </button>
        <NotificationToggle />
        <RouterLink to="/notifications" class="profile-link">
          Notifications
          <span
            v-if="unreadNotificationCount > 0"
            class="unread-badge"
            :title="`${unreadNotificationCount} unread`"
            >{{ unreadNotificationCount }}</span
          >
        </RouterLink>
        <RouterLink to="/profile" class="profile-link">My profile</RouterLink>
        <span class="user-email">{{ auth.user?.email }}</span>
        <button type="button" @click="handleLogout">Log out</button>
      </nav>
    </header>
    <RouterView />
  </div>
</template>

<style scoped>
.layout-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 1rem 1.5rem;
  background-color: var(--color-surface);
  color: var(--color-text);
  border-bottom: 1px solid rgba(26, 62, 47, 0.1);
}

.brand {
  font-size: 1.5rem;
}

nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.user-email {
  font-size: 0.9rem;
}

.profile-link {
  color: var(--color-primary);
  font-family: var(--font-body);
  font-size: 0.9rem;
  text-decoration: none;
}

.profile-link:hover {
  text-decoration: underline;
}

.unread-badge {
  display: inline-block;
  min-width: 1.25rem;
  margin-left: 0.25rem;
  padding: 0 0.35rem;
  border-radius: var(--radius-pill);
  background-color: var(--color-primary);
  color: var(--color-surface);
  font-size: 0.75rem;
  line-height: 1.25rem;
  text-align: center;
}

button {
  padding: 0.4rem 0.8rem;
  cursor: pointer;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-pill);
  background-color: transparent;
  color: var(--color-primary);
  font-family: var(--font-body);
}

button:hover {
  background-color: var(--color-background);
}

.hike-pill {
  border-color: var(--color-status-open);
  background-color: var(--color-status-open);
  color: var(--color-surface);
}

.hike-pill:hover {
  background-color: var(--color-status-open);
  filter: brightness(0.95);
}
</style>
