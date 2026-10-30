<script setup>
import { ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const NAV_ITEMS = [
  {
    name: 'admin-home',
    to: '/admin',
    label: 'Dashboard'
  },
  {
    name: 'admin-trails',
    to: '/admin/trails',
    label: 'Trails'
  },
  {
    name: 'admin-stats',
    to: '/admin/stats',
    label: 'Statistics'
  }
]

const INTRO_STORAGE_KEY = 'ecotrail:admin-intro-dismissed'

function introAlreadyDismissed() {
  try {
    return localStorage.getItem(INTRO_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const introVisible = ref(!introAlreadyDismissed())

function dismissIntro() {
  introVisible.value = false
  try {
    localStorage.setItem(INTRO_STORAGE_KEY, '1')
  } catch {
    // The intro simply shows again on the next visit.
  }
}

async function handleLogout() {
  await auth.endSession()
  router.push('/login')
}
</script>

<template>
  <div class="layout admin-layout">
    <header class="layout-header">
      <span class="brand">EcoTrail &mdash; Park authority information board</span>
      <button
        type="button"
        class="admin-layout__logout-icon"
        aria-label="Log out"
        title="Log out"
        @click="handleLogout"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
      <nav class="admin-layout__top-nav">
        <RouterLink
          v-for="item in NAV_ITEMS"
          :key="item.name"
          :to="item.to"
          class="admin-layout__nav-link"
          :class="{ 'admin-layout__nav-link--active': route.name === item.name }"
        >
          {{ item.label }}
        </RouterLink>
        <button type="button" class="admin-layout__help" @click="introVisible = true">Help</button>
        <span class="user-email">{{ auth.user?.email }}</span>
        <button type="button" class="admin-layout__logout" @click="handleLogout">Log out</button>
      </nav>
    </header>
    <section v-if="introVisible" class="admin-layout__intro" aria-labelledby="admin-intro-title">
      <div class="admin-layout__intro-text">
        <h2 id="admin-intro-title" class="admin-layout__intro-title">Welcome to the board</h2>
        <ul class="admin-layout__intro-list">
          <li>
            <strong>Dashboard:</strong> review the reports sent by hikers and validate or reject
            them.
          </li>
          <li>
            <strong>Trails:</strong> change a trail's status, handle closure proposals and set the
            alert thresholds.
          </li>
          <li><strong>Statistics:</strong> see visits and reports over time.</li>
        </ul>
      </div>
      <button type="button" class="admin-layout__intro-dismiss" @click="dismissIntro">
        Got it
      </button>
    </section>
    <RouterView />
  </div>
</template>

<style scoped>
.layout-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background-color: var(--color-surface);
  color: var(--color-text);
  border-bottom: 1px solid rgba(26, 62, 47, 0.1);
}

.brand {
  font-size: 1.5rem;
}

.admin-layout__top-nav {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-email {
  font-size: 0.9rem;
}

.admin-layout__nav-link {
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-decoration: none;
}

.admin-layout__nav-link:hover {
  color: var(--color-primary);
}

.admin-layout__nav-link--active {
  color: var(--color-primary);
  font-weight: 600;
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

.admin-layout__logout-icon {
  display: none;
}

.admin-layout {
  min-height: 100vh;
}

.admin-layout :deep(.admin-page__stat-card),
.admin-layout :deep(.admin-page__map-card),
.admin-layout :deep(.admin-page__activity),
.admin-layout :deep(.admin-trails-page__map-card) {
  border: 1px solid var(--color-card-border);
}

.admin-layout :deep(.base-button) {
  min-height: 40px;
  padding: 0.55rem 1.1rem;
  font-size: 0.9rem;
}

.admin-layout__intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1.5rem;
  background-color: var(--color-surface);
  border-bottom: 1px solid rgba(26, 62, 47, 0.1);
  border-left: 4px solid var(--color-primary);
}

.admin-layout__intro-title {
  margin: 0 0 0.25rem;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.15rem;
}

.admin-layout__intro-list {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.admin-layout__intro-dismiss {
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .layout-header {
    position: sticky;
    top: 0;
    z-index: 1100;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.4rem 0.75rem;
    padding: 0.6rem 0.75rem 0;
  }

  .brand {
    font-size: 1.05rem;
    line-height: 1.2;
  }

  .admin-layout__logout-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
  }

  .admin-layout__logout-icon svg {
    width: 20px;
    height: 20px;
  }

  .admin-layout__top-nav {
    grid-column: 1 / -1;
    gap: 0;
  }

  .user-email,
  .admin-layout__logout {
    display: none;
  }

  .admin-layout__help {
    display: none;
  }

  .admin-layout :deep(.base-button) {
    min-height: 44px;
  }

  .admin-layout__intro {
    flex-direction: column;
    padding: 0.75rem;
  }

  .admin-layout__nav-link {
    flex: 1;
    padding: 0.55rem 0 0.5rem;
    border-bottom: 3px solid transparent;
    text-align: center;
  }

  .admin-layout__nav-link--active {
    border-bottom-color: var(--color-primary);
  }
}
</style>
