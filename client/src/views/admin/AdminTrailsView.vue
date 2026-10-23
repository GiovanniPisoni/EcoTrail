<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import TrailsMap from '@/components/trails/TrailsMap.vue'
import MapSearch from '@/components/trails/MapSearch.vue'
import AdminTrailsSidebar from '@/components/admin/AdminTrailsSidebar.vue'
import AdminTrailPanel from '@/components/admin/AdminTrailPanel.vue'
import AdminMapFrame from '@/components/admin/AdminMapFrame.vue'

const route = useRoute()
const mapRef = ref(null)
const mapInstance = shallowRef(null)
const visibleTrails = ref([])
const selectedTrailId = ref(null)

function onMapReady(map) {
  map.zoomControl?.setPosition('bottomright')
  mapInstance.value = map
}

const phoneScreen = window.matchMedia('(max-width: 640px)')
const isPhone = ref(phoneScreen.matches)
const mapCard = ref(null)

function updatePhone(event) {
  isPhone.value = event.matches
}

phoneScreen.addEventListener('change', updatePhone)
onBeforeUnmount(() => phoneScreen.removeEventListener('change', updatePhone))

function showMap() {
  mapCard.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function toggleSelection(trailId) {
  const selecting = Boolean(trailId) && selectedTrailId.value !== trailId
  selectedTrailId.value = selectedTrailId.value === trailId ? null : trailId
  if (selecting && isPhone.value) {
    mapRef.value?.centerOnTrail(trailId)
    showMap()
  }
}

onMounted(() => {
  const trailId = route.query.trail
  if (typeof trailId === 'string' && trailId) mapRef.value?.focusOnTrail(trailId)
})

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
      :expand-selected="isPhone"
      @select="toggleSelection"
    >
      <template #selected>
        <AdminTrailPanel
          :trail-id="selectedTrailId"
          class="admin-trails-page__panel"
          @status-changed="onStatusChanged"
        />
      </template>
    </AdminTrailsSidebar>

    <div class="admin-trails-page__side">
      <div ref="mapCard" class="admin-trails-page__map-card">
        <AdminMapFrame>
          <TrailsMap
            ref="mapRef"
            class="admin-trails-page__map"
            :selected-trail-id="selectedTrailId"
            @trails-loaded="visibleTrails = $event"
            @trail-selected="toggleSelection"
            @map-ready="onMapReady"
          />
          <MapSearch
            v-if="mapInstance"
            :map="mapInstance"
            @trail-picked="selectedTrailId = $event"
          />
        </AdminMapFrame>
      </div>

      <AdminTrailPanel
        v-if="selectedTrailId && !isPhone"
        class="admin-trails-page__panel"
        :trail-id="selectedTrailId"
        @status-changed="onStatusChanged"
      />
      <p v-else-if="!isPhone" class="admin-trails-page__hint">
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
    overflow-y: visible;
  }

  .admin-trails-page__side {
    flex: none;
    order: 0;
    overflow-y: visible;
    padding: 0.75rem 0.75rem 0;
  }

  .admin-trails-page__map-card {
    height: 38vh;
    min-height: 260px;
    scroll-margin-top: 96px;
  }
}
</style>
