<script setup>
import { ref, onMounted } from 'vue'

const health = ref('checking...')

onMounted(async () => {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    health.value = data.status
  } catch {
    health.value = 'server non raggiungibile'
  }
})
</script>

<template>
  <main>
    <h1>EcoTrail</h1>
    <p>Stato server: {{ health }}</p>
    <RouterView />
  </main>
</template>
