<script setup>
import { ref } from 'vue'
import TrailsMap from '@/components/TrailsMap.vue'
import TrailsSidebar from '@/components/TrailsSidebar.vue'

const visibleTrails = ref([])

const selectedTrailId = ref(null)

function toggleSelection(trailId) {
  selectedTrailId.value = selectedTrailId.value === trailId ? null : trailId
}

const sidebarOpen = ref(true)
</script>

<template>
  <main class="map-page">
    <TrailsSidebar
      v-if="sidebarOpen"
      :trails="visibleTrails"
      :selected-id="selectedTrailId"
      class="map-page__sidebar"
      @close="sidebarOpen = false"
      @select="toggleSelection"
    />
    <button
      v-else
      type="button"
      class="map-page__sidebar-toggle"
      title="Show nearby trails"
      @click="sidebarOpen = true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 20 9 8l4 6 3-5 5 11z" />
        <circle cx="9" cy="5" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    </button>

    <TrailsMap
      :selected-trail-id="selectedTrailId"
      class="map-page__map"
      @trails-loaded="visibleTrails = $event"
      @trail-selected="toggleSelection"
    />
  </main>
</template>

<style scoped>
.map-page {
  position: relative;
  display: flex;
  height: calc(100vh - 65px);
}

.map-page__sidebar {
  width: 300px;
  flex-shrink: 0;
  border-right: 1px solid rgba(26, 62, 47, 0.1);
  background-color: var(--color-background);
}

.map-page__sidebar-toggle {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
  cursor: pointer;
}

.map-page__sidebar-toggle:hover {
  background: var(--color-background);
}

.map-page__sidebar-toggle svg {
  width: 22px;
  height: 22px;
}

.map-page__map {
  flex: 1;
  min-width: 0;
}

@media (max-width: 640px) {
  .map-page {
    flex-direction: column;
    height: auto;
    min-height: calc(100vh - 65px);
  }

  .map-page__sidebar {
    width: 100%;
    max-height: 40vh;
    border-right: none;
    border-top: 1px solid rgba(26, 62, 47, 0.1);
    order: 2;
  }

  .map-page__map {
    min-height: 60vh;
    order: 1;
  }
}
</style>
