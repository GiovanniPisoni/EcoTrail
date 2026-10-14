<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SendReportView from '@/views/hiker/SendReportView.vue'
import TrailsMap from '@/components/trails/TrailsMap.vue'
import TrailsSidebar from '@/components/trails/TrailsSidebar.vue'
import ReportsLayer from '@/components/reports/ReportsLayer.vue'
import MapSearch from '@/components/trails/MapSearch.vue'
import HikeModeToggle from '@/components/common/HikeModeToggle.vue'

const route = useRoute()
const router = useRouter()

const visibleTrails = ref([])
const hiddenStatuses = ref([])
const reportDialogOpen = ref(false)
const mapInstance = shallowRef(null)
const trailsMap = ref(null)

const selectedTrailId = ref(null)
const focusTrailId = typeof route.query.trail === 'string' ? route.query.trail : null

function toggleSelection(trailId) {
  selectedTrailId.value = selectedTrailId.value === trailId ? null : trailId
}

function selectFromSidebar(trailId) {
  const selecting = Boolean(trailId) && selectedTrailId.value !== trailId
  toggleSelection(trailId)
  if (selecting) trailsMap.value?.centerOnTrail(trailId)
}

const MOBILE_QUERY = '(max-width: 640px)'
const mobileScreen = window.matchMedia(MOBILE_QUERY)

const sidebarOpen = ref(!mobileScreen.matches)

function closeSidebar() {
  sidebarOpen.value = false
  selectedTrailId.value = null
}

const mapPage = ref(null)
let sheetObserver = null

function trackSheetHeight() {
  sheetObserver?.disconnect()
  sheetObserver = null

  const page = mapPage.value
  const sheet = page?.querySelector('.map-page__sheet')
  if (!page) return

  if (!mobileScreen.matches || !sheet) {
    page.style.removeProperty('--sheet-h')
    return
  }

  const update = () => page.style.setProperty('--sheet-h', `${sheet.offsetHeight}px`)
  update()
  sheetObserver = new ResizeObserver(update)
  sheetObserver.observe(sheet)
}

watch(sidebarOpen, async () => {
  await nextTick()
  trackSheetHeight()
})

onMounted(() => {
  trackSheetHeight()
  mobileScreen.addEventListener('change', trackSheetHeight)
})

onBeforeUnmount(() => {
  sheetObserver?.disconnect()
  mobileScreen.removeEventListener('change', trackSheetHeight)
})

function selectFromMap(trailId) {
  const selecting = selectedTrailId.value !== trailId
  toggleSelection(trailId)
  if (selecting) sidebarOpen.value = true
}

function showTrailOnMap(trailId) {
  trailsMap.value?.focusOnTrail(trailId)
}

watch(
  () => route.query.report,
  (requested) => {
    if (!requested) return
    reportDialogOpen.value = true
    const otherParams = { ...route.query }
    delete otherParams.report
    router.replace({ query: otherParams })
  },
  { immediate: true }
)
</script>

<template>
  <main ref="mapPage" class="map-page">
    <TrailsSidebar
      v-if="sidebarOpen"
      :trails="visibleTrails"
      :selected-id="selectedTrailId"
      :filtered="hiddenStatuses.length > 0"
      class="map-page__sidebar map-page__sheet"
      @close="closeSidebar"
      @select="selectFromSidebar"
      @focus-trail="showTrailOnMap"
    />
    <button
      v-else
      type="button"
      class="map-page__sidebar-toggle map-page__sheet"
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
      <span>Trails ({{ visibleTrails.length }})</span>
      <svg
        class="map-page__sidebar-chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 15 12 9 18 15" />
      </svg>
    </button>

    <div class="map-page__map-wrap">
      <TrailsMap
        ref="trailsMap"
        :selected-trail-id="selectedTrailId"
        :focus-trail-id="focusTrailId"
        class="map-page__map"
        @trails-loaded="visibleTrails = $event"
        @filter-changed="hiddenStatuses = $event"
        @trail-selected="selectFromMap"
        @map-ready="mapInstance = $event"
      />
      <ReportsLayer v-if="mapInstance" :map="mapInstance" :sidebar-open="sidebarOpen" />
      <MapSearch v-if="mapInstance" :map="mapInstance" @trail-picked="showTrailOnMap" />
      <HikeModeToggle />
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
  gap: 8px;
  min-width: 44px;
  height: 44px;
  padding: 0 14px 0 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-primary);
  font: 600 0.85rem var(--font-body);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
  cursor: pointer;
}

.map-page__sidebar-toggle:hover {
  background: var(--color-background);
}

.map-page__sidebar-toggle svg {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.map-page__sidebar-chevron {
  display: none;
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
  bottom: calc(var(--sheet-h, 0px) + 16px);
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
  .map-page__new-report {
    height: 48px;
    padding: 0 1rem;
    font-size: 0.9rem;
  }
}

@media (max-width: 640px) {
  .map-page {
    --sheet-h: 52px;
    display: block;
    height: calc(100vh - var(--hiker-bar-height, 49px));
    height: calc(100dvh - var(--hiker-bar-height, 49px));
    min-height: 0;
    overflow: hidden;
  }

  .map-page__map-wrap {
    position: absolute;
    inset: 0;
    min-height: 0;
  }

  .map-page__map {
    position: absolute;
    inset: 0;
    height: auto;
  }

  .map-page__sidebar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1100;
    width: 100%;
    max-height: 45vh;
    max-height: 45dvh;
    border-right: none;
    border-top: 1px solid rgba(26, 62, 47, 0.1);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -2px 12px rgba(26, 62, 47, 0.18);
    overscroll-behavior: contain;
  }

  .map-page__sidebar-toggle {
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1100;
    justify-content: space-between;
    width: 100%;
    height: 52px;
    padding: 0 1rem;
    border-radius: 16px 16px 0 0;
    font-size: 0.95rem;
    box-shadow: 0 -2px 12px rgba(26, 62, 47, 0.18);
  }

  .map-page__sidebar-toggle span {
    flex: 1;
    text-align: left;
  }

  .map-page__sidebar-chevron {
    display: block;
  }
}
</style>
