<script setup>
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { connectRealtime, disconnectRealtime } from '@/utils/realtime.js'
import OfflineBanner from '@/components/common/OfflineBanner.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

watch(
  () => auth.token,
  (token) => {
    if (token) {
      connectRealtime(token)
      return
    }

    disconnectRealtime()
    if (route.meta.requiresAuth) router.push({ name: 'login' })
  },
  { immediate: true }
)
</script>

<template>
  <RouterView />
  <OfflineBanner />
</template>
