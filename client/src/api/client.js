import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import { markResponse } from '@/utils/offline/network.js'

const api = axios.create({
  baseURL: '/api'
})

api.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => {
    markResponse(response.headers)
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      const auth = useAuthStore()
      if (auth.isAuthenticated) auth.expireSession()
      else auth.logout()
    }
    return Promise.reject(error)
  }
)

export default api
