<script setup>
import { RouterView, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="layout admin-layout">
    <header class="layout-header">
      <span class="brand">EcoTrail &mdash; Park authority information board</span>
      <nav>
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
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background-color: #37474f;
  color: white;
}

.brand {
  font-weight: bold;
  font-size: 1.2rem;
}

nav {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-email {
  font-size: 0.9rem;
}

button {
  padding: 0.4rem 0.8rem;
  cursor: pointer;
  border: none;
  border-radius: 4px;
}
</style>
