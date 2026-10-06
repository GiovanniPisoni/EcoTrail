<script setup>
import { watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { connectRealtime, disconnectRealtime } from '@/utils/realtime.js'
import OfflineBanner from '@/components/OfflineBanner.vue'

const auth = useAuthStore()

watch(
  () => auth.token,
  (token) => (token ? connectRealtime(token) : disconnectRealtime()),
  { immediate: true }
)
</script>

<template>
  <RouterView />
  <OfflineBanner />
</template>
