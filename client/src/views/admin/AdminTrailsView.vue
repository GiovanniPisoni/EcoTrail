<script setup>
import { ref, shallowRef } from 'vue'
import TrailsMap from '@/components/trails/TrailsMap.vue'
import MapSearch from '@/components/trails/MapSearch.vue'
import AdminTrailsSidebar from '@/components/admin/AdminTrailsSidebar.vue'
import AdminTrailPanel from '@/components/admin/AdminTrailPanel.vue'

const mapRef = ref(null)
const mapInstance = shallowRef(null)
const visibleTrails = ref([])
const selectedTrailId = ref(null)

function toggleSelection(trailId) {
  selectedTrailId.value = selectedTrailId.value === trailId ? null : trailId
}

function onStatusChanged() {
  mapRef.value?.refresh()
}
</script>

<template>
  <main class="admin-trails-page">
    <AdminTrailsSidebar
      class="admin-trails-page__sidebar"
      :trails="visibleTrails"
      :selected-id="selectedTrailId"
      @select="toggleSelection"
    />

    <div class="admin-trails-page__side">
      <div class="admin-trails-page__map-card">
        <TrailsMap
          ref="mapRef"
          class="admin-trails-page__map"
          :selected-trail-id="selectedTrailId"
          @trails-loaded="visibleTrails = $event"
          @trail-selected="toggleSelection"
          @map-ready="mapInstance = $event"
        />
        <MapSearch v-if="mapInstance" :map="mapInstance" @trail-picked="selectedTrailId = $event" />
      </div>

      <AdminTrailPanel
        v-if="selectedTrailId"
        class="admin-trails-page__panel"
        :trail-id="selectedTrailId"
        @status-changed="onStatusChanged"
      />
      <p v-else class="admin-trails-page__hint">
        Select a trail on the map or from the list to see its details.
      </p>
    </div>
  </main>
</template>

<style scoped>
.admin-trails-page {
  display: flex;
  height: calc(100vh - 65px);
}

.admin-trails-page__sidebar {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid rgba(26, 62, 47, 0.1);
  background-color: var(--color-background);
}

.admin-trails-page__side {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 1rem;
  gap: 1rem;
}

.admin-trails-page__map-card {
  position: relative;
  flex-shrink: 0;
  height: 320px;
  overflow: hidden;
  border-radius: var(--radius-card);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
  background-color: var(--color-surface);
}

.admin-trails-page__map {
  width: 100%;
  height: 100%;
}

.admin-trails-page__hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 1rem;
  border-radius: var(--radius-card);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
  background-color: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 0.9rem;
  text-align: center;
}

@media (max-width: 640px) {
  .admin-trails-page {
    flex-direction: column;
    height: auto;
    min-height: calc(100vh - 65px);
  }

  .admin-trails-page__sidebar {
    width: 100%;
    max-height: none;
    border-right: none;
    order: 1;
  }

  .admin-trails-page__side {
    order: 2;
  }
}
</style>
