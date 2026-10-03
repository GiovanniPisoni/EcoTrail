<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import SendReportView from '@/views/SendReportView.vue'
import TrailsMap from '@/components/TrailsMap.vue'
import TrailsSidebar from '@/components/TrailsSidebar.vue'
import ReportsLayer from '@/components/ReportsLayer.vue'

const route = useRoute()

const visibleTrails = ref([])
const reportDialogOpen = ref(false)
const mapInstance = ref(null)

const selectedTrailId = ref(null)
const focusTrailId = typeof route.query.trail === 'string' ? route.query.trail : null

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

    <div class="map-page__map-wrap">
      <TrailsMap
        :selected-trail-id="selectedTrailId"
        :focus-trail-id="focusTrailId"
        class="map-page__map"
        @trails-loaded="visibleTrails = $event"
        @trail-selected="toggleSelection"
        @map-ready="mapInstance = $event"
      />
      <ReportsLayer v-if="mapInstance" :map="mapInstance" :sidebar-open="sidebarOpen" />
    </div>

    <button
      type="button"
      class="map-page__new-report"
      title="New report"
      @click="reportDialogOpen = true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>New Report</span>
    </button>

    <SendReportView v-if="reportDialogOpen" @close="reportDialogOpen = false" />
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
  bottom: 10px;
  left: 10px;
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

.map-page__map-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.map-page__map {
  width: 100%;
  height: 100%;
}

.map-page__new-report {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 52px;
  padding: 0 1.25rem;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-surface);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.95rem;
  box-shadow: 0 2px 6px rgba(26, 62, 47, 0.3);
  cursor: pointer;
}

.map-page__new-report:hover {
  background: var(--color-primary-pressed);
}

.map-page__new-report svg {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .map-page__new-report span {
    display: none;
  }

  .map-page__new-report {
    width: 52px;
    padding: 0;
    justify-content: center;
  }
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

  .map-page__map-wrap {
    min-height: 60vh;
    order: 1;
  }
}
</style>
