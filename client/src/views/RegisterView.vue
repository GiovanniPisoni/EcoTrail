<script setup>
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const isSubmitting = ref(false)

const auth = useAuthStore()
const router = useRouter()

async function handleSubmit() {
  error.value = ''

  if (password.value !== confirmPassword.value) {
    error.value = 'Le due password non coincidono'
    return
  }

  isSubmitting.value = true

  try {
    await auth.register(email.value, password.value)
    router.push('/')
  } catch (err) {
    error.value =
      err.response?.status === 409
        ? 'Email già registrata'
        : 'Errore durante la registrazione, riprova'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <h1>Registrati</h1>
    <form @submit.prevent="handleSubmit">
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email" />
      </label>
      <label>
        Password
        <input v-model="password" type="password" required autocomplete="new-password" />
      </label>
      <label>
        Conferma password
        <input v-model="confirmPassword" type="password" required autocomplete="new-password" />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? 'Registrazione in corso...' : 'Registrati' }}
      </button>
    </form>
    <p>Hai già un account? <RouterLink to="/login">Accedi</RouterLink></p>
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

.error {
  color: #c0392b;
}
</style>
