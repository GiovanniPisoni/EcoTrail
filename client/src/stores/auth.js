import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import api from '@/api/client'
import { forgetPushSubscription } from '@/utils/push/pushSubscription.js'

const TOKEN_KEY = 'ecotrail_token'
const USER_KEY = 'ecotrail_user'
const FORGET_PUSH_TIMEOUT_MS = 3000

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY))
  const user = ref(JSON.parse(localStorage.getItem(USER_KEY) || 'null'))

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  function setSession(newToken, newUser) {
    token.value = newToken
    user.value = newUser
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(newUser))
  }

  function clearSession() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    token.value = data.token

    const { data: me } = await api.get('/auth/me')
    setSession(data.token, { ...me, email })
  }

  async function register(email, password) {
    await api.post('/auth/register', { email, password })
    await login(email, password)
  }

  function logout() {
    clearSession()
  }

  async function endSession() {
    await Promise.race([
      forgetPushSubscription(),
      new Promise((resolve) => setTimeout(resolve, FORGET_PUSH_TIMEOUT_MS))
    ])
    clearSession()
  }

  return { token, user, isAuthenticated, isAdmin, login, register, logout, endSession }
})
