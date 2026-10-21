<script setup>
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
        <span class="user-email">{{ auth.user?.email }}</span>
        <button type="button" class="admin-layout__logout" @click="handleLogout">Log out</button>
      </nav>
    </header>
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
