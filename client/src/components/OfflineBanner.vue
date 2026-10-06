<script setup>
import { isOffline } from '@/utils/network.js'
</script>

<template>
  <div v-if="isOffline" class="offline-banner" role="status">
    You are offline. Showing the data saved on this device.
  </div>
</template>

<style scoped>
.offline-banner {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 2000;
  max-width: calc(100vw - 32px);
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  background: var(--color-secondary);
  color: #fff;
  font-size: 0.9rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
</style>
