<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AuthTabs from '@/components/auth/AuthTabs.vue'

const email = ref('')
const password = ref('')
const error = ref('')
const isSubmitting = ref(false)

const auth = useAuthStore()
const router = useRouter()

async function handleSubmit() {
  error.value = ''
  isSubmitting.value = true

  try {
    await auth.login(email.value, password.value)
    router.push(auth.isAdmin ? '/admin' : '/')
  } catch (err) {
    error.value =
      err.response?.status === 401 ? 'Invalid credentials' : 'Error connecting to the server'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <AuthTabs />
    <h1>Log in</h1>
    <p v-if="auth.sessionEnded" class="notice" role="status">
      Your session has ended, or your account no longer exists. Log in again, or sign up if you
      don’t have an account yet.
    </p>
    <form @submit.prevent="handleSubmit">
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email" />
      </label>
      <label>
        Password
        <input v-model="password" type="password" required autocomplete="current-password" />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? 'Logging in...' : 'Log in' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.auth-page {
  max-width: 24rem;
  margin: 4rem auto;
  padding: 0 1rem;
}

form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

input {
  padding: 0.5rem;
  font-size: 1rem;
}

button {
  padding: 0.6rem;
  font-size: 1rem;
  cursor: pointer;
}

.notice {
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.95rem;
}

.error {
  color: #c0392b;
}
</style>
