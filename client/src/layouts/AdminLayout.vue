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
    label: 'Dashboard',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/></svg>'
  },
  {
    name: 'admin-trails',
    to: '/admin/trails',
    label: 'Trails',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20 9 8l4 6 3-5 5 11z"/></svg>'
  }
]

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="layout admin-layout">
    <header class="layout-header">
      <span class="brand">EcoTrail &mdash; Park authority information board</span>
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
        <button type="button" @click="handleLogout">Log out</button>
      </nav>
    </header>
    <RouterView />
    <nav class="admin-layout__bottom-nav">
      <RouterLink
        v-for="item in NAV_ITEMS"
        :key="item.name"
        :to="item.to"
        class="admin-layout__bottom-nav-link"
        :class="{ 'admin-layout__bottom-nav-link--active': route.name === item.name }"
      >
        <span class="admin-layout__bottom-nav-icon" v-html="item.icon" />
        <span>{{ item.label }}</span>
      </RouterLink>
      <button type="button" class="admin-layout__bottom-nav-link" @click="handleLogout">
        <span class="admin-layout__bottom-nav-icon">
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
        </span>
        <span>Log out</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.admin-layout {
  padding-bottom: 0;
}

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

.admin-layout__bottom-nav {
  display: none;
}

@media (max-width: 640px) {
  .admin-layout {
    padding-bottom: 64px;
  }

  .admin-layout__top-nav {
    display: none;
  }

  .admin-layout__bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    display: flex;
    background-color: var(--color-surface);
    border-top: 1px solid rgba(26, 62, 47, 0.1);
  }

  .admin-layout__bottom-nav-link {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.5rem 0;
    border: none;
    border-radius: 0;
    background: none;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: 0.7rem;
    text-decoration: none;
    cursor: pointer;
  }

  .admin-layout__bottom-nav-link--active {
    color: var(--color-primary);
    font-weight: 600;
  }

  .admin-layout__bottom-nav-icon svg {
    width: 22px;
    height: 22px;
  }
}
</style>
