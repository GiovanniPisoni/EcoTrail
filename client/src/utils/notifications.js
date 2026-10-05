import { ref } from 'vue'
import api from '@/api/client.js'

export const unreadNotificationCount = ref(0)

export async function refreshUnreadNotificationCount() {
  try {
    const { data } = await api.get('/notifications', { params: { limit: 1 } })
    unreadNotificationCount.value = data.unreadCount
  } catch (err) {
    console.error('Failed to load the unread notifications count:', err)
  }
}
