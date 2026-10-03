<script setup>
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import NotificationToggle from '@/components/NotificationToggle.vue'

const auth = useAuthStore()
const router = useRouter()

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="layout hiker-layout">
    <header class="layout-header">
      <span class="brand">EcoTrail</span>
      <nav>
        <NotificationToggle />
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
</style>
