<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

const menuOpen = ref(false)

watch(
  () => route.fullPath,
  () => (menuOpen.value = false)
)

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
  menuOpen.value = false
  stopHikeMode()
  await auth.endSession()
  router.push('/login')
}
</script>

<template>
  <div class="layout hiker-layout">
    <header class="layout-header">
      <button
        type="button"
        class="menu-button"
        aria-label="Menu"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
        <span v-if="hikeModeActive" class="menu-button__dot" title="Hike mode on" />
      </button>

      <div class="header-brand">
        <RouterLink to="/notifications" class="bell-link" aria-label="Notifications">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <span v-if="unreadNotificationCount > 0" class="bell-badge">{{
            unreadNotificationCount
          }}</span>
        </RouterLink>
        <span class="brand">EcoTrail</span>
      </div>

      <nav :class="{ 'layout-nav--open': menuOpen }">
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
.hiker-layout {
  --hiker-bar-height: 49px;
}

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

.menu-button,
.bell-link {
  display: none;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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

@media (max-width: 640px) {
  .layout-header {
    position: relative;
    z-index: 2000;
    flex-wrap: nowrap;
    height: var(--hiker-bar-height);
    padding: 0 0.75rem;
  }

  .menu-button,
  .bell-link {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: none;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-primary);
  }

  .menu-button svg,
  .bell-link svg {
    width: 24px;
    height: 24px;
  }

  .menu-button__dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-status-open);
  }

  .bell-badge {
    position: absolute;
    top: 2px;
    right: 0;
    min-width: 1.1rem;
    padding: 0 0.3rem;
    border-radius: var(--radius-pill);
    background-color: var(--color-primary);
    color: var(--color-surface);
    font-size: 0.7rem;
    line-height: 1.1rem;
    text-align: center;
  }

  .brand {
    font-size: 1.35rem;
  }

  nav {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    display: none;
    flex-direction: column;
    align-items: stretch;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem 0.75rem;
    background-color: var(--color-surface);
    border-bottom: 1px solid rgba(26, 62, 47, 0.1);
    box-shadow: 0 8px 16px rgba(26, 62, 47, 0.12);
  }

  nav.layout-nav--open {
    display: flex;
  }

  nav .profile-link {
    padding: 0.7rem 0;
    font-size: 1rem;
  }

  nav .user-email {
    padding: 0.25rem 0;
    color: var(--color-text-muted);
  }

  nav > button {
    width: 100%;
    padding: 0.6rem 0.8rem;
  }
}
</style>
