<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <nav class="auth-tabs" aria-label="Log in or sign up">
    <RouterLink to="/login" class="auth-tabs__tab" exact-active-class="auth-tabs__tab--active">
      Log in
    </RouterLink>
    <RouterLink to="/register" class="auth-tabs__tab" exact-active-class="auth-tabs__tab--active">
      Sign up
    </RouterLink>
  </nav>
</template>

<style scoped>
.auth-tabs {
  display: flex;
  margin-bottom: 1.5rem;
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.auth-tabs__tab {
  flex: 1;
  padding: 0.7rem 0.5rem;
  color: var(--color-primary);
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
  text-decoration: none;
}

.auth-tabs__tab:hover {
  background: var(--color-background);
}

.auth-tabs__tab--active {
  background: var(--color-primary);
  color: var(--color-surface);
}

.auth-tabs__tab--active:hover {
  background: var(--color-primary);
}
</style>
