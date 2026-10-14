<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import api from '@/api/client.js'
import { onRealtime, RECONNECTED } from '@/utils/realtime.js'
import { REPORT_TYPE_OPTIONS, REPORT_SEVERITY_OPTIONS } from '@/config/reportOptions.js'

const props = defineProps({
  map: {
    type: Object,
    required: true
  },
  sidebarOpen: {
    type: Boolean,
    default: false
  }
})

const PERIOD_OPTIONS = [
  { value: '24h', label: '24h', hours: 24 },
  { value: '7d', label: '7 days', hours: 24 * 7 },
  { value: '30d', label: '30 days', hours: 24 * 30 },
  { value: 'all', label: 'All time', hours: null }
]

const typeFilter = ref('')
const periodFilter = ref('all')
const filtersOpen = ref(false)

let clusterGroup = null
let lastReportsData = null
let requestSeq = 0
let moveTimer = null

function reportTypeOption(type) {
  return REPORT_TYPE_OPTIONS.find((option) => option.value === type)
}

function severityColor(severity) {
  return REPORT_SEVERITY_OPTIONS.find((option) => option.value === severity)?.color ?? '#6b7280'
}

function buildMarkerIcon(feature) {
  const { type, severity } = feature.properties
  const icon = reportTypeOption(type)?.icon ?? ''

  return L.divIcon({
    className: 'report-marker',
    html: `<span class="report-marker__badge" style="background:${severityColor(severity)}">${icon}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
  })
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function buildPopupContent(feature) {
  const { type, severity, description, photoUrl, trail, createdAt } = feature.properties

  const container = document.createElement('div')
  container.className = 'report-popup'

  const title = document.createElement('strong')
  title.textContent = reportTypeOption(type)?.label ?? type
  container.append(title)

  const meta = document.createElement('div')
  meta.className = 'report-popup__meta'
  meta.innerHTML = `<span class="report-popup__severity" style="color:${severityColor(severity)}">${severity}</span> · ${trail.name} · ${formatDate(createdAt)}`
  container.append(meta)

  if (photoUrl) {
    const photo = document.createElement('img')
    photo.src = photoUrl
    photo.alt = 'Report photo'
    photo.className = 'report-popup__photo'
    container.append(photo)
  }

  if (description) {
    const text = document.createElement('p')
    text.textContent = description
    container.append(text)
  }

  return container
}

function renderReportsLayer() {
  if (!lastReportsData) return

  const markers = lastReportsData.features.map((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates
    const marker = L.marker([latitude, longitude], { icon: buildMarkerIcon(feature) })
    marker.bindPopup(buildPopupContent(feature))
    return marker
  })

  clusterGroup.clearLayers()
  clusterGroup.addLayers(markers)
}

function sinceParam() {
  const period = PERIOD_OPTIONS.find((option) => option.value === periodFilter.value)
  if (!period?.hours) return undefined
  return new Date(Date.now() - period.hours * 60 * 60 * 1000).toISOString()
}

async function loadReports() {
  const seq = ++requestSeq
  const bounds = props.map.getBounds()
  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')

  let data
  try {
    ;({ data } = await api.get('/reports', {
      params: { bbox, type: typeFilter.value || undefined, since: sinceParam() }
    }))
  } catch (err) {
    console.error('Failed to load reports:', err)
    return
  }

  if (seq !== requestSeq) return

  lastReportsData = data
  renderReportsLayer()
}

function scheduleLoadReports() {
  clearTimeout(moveTimer)
  moveTimer = setTimeout(loadReports, 200)
}

watch([typeFilter, periodFilter], loadReports)

let stopRealtime = []

onMounted(() => {
  clusterGroup = L.markerClusterGroup({
    disableClusteringAtZoom: 16
  })
  clusterGroup.addTo(props.map)

  props.map.on('moveend zoomend', scheduleLoadReports)
  stopRealtime = [onRealtime('report:updated', loadReports), onRealtime(RECONNECTED, loadReports)]
  loadReports()
})

onUnmounted(() => {
  stopRealtime.forEach((stop) => stop())
  stopRealtime = []
  clearTimeout(moveTimer)
  props.map.off('moveend zoomend', scheduleLoadReports)
  clusterGroup?.remove()
})
</script>

<template>
  <div class="reports-filters" :class="{ 'reports-filters--sidebar-open': sidebarOpen }">
    <button
      type="button"
      class="reports-filters__toggle"
      title="Choose which problem reports are shown on the map"
      @click="filtersOpen = !filtersOpen"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
      Report filters
    </button>

    <div v-if="filtersOpen" class="reports-filters__panel">
      <p class="reports-filters__help">
        Choose which problem reports are shown on the map. This only changes what you see. To stop
        receiving alerts, go to
        <RouterLink to="/notifications">Notifications and alerts</RouterLink>.
      </p>
      <label class="reports-filters__field">
        <span>Type</span>
        <select v-model="typeFilter">
          <option value="">All types</option>
          <option v-for="option in REPORT_TYPE_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <div class="reports-filters__field">
        <span>Period</span>
        <div class="reports-filters__period-group">
          <button
            v-for="option in PERIOD_OPTIONS"
            :key="option.value"
            type="button"
            class="reports-filters__period-option"
            :class="{ 'reports-filters__period-option--selected': periodFilter === option.value }"
            @click="periodFilter = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reports-filters {
  position: absolute;
  left: 10px;
  bottom: 62px;
  z-index: 1000;
}

.reports-filters--sidebar-open {
  bottom: 10px;
}

@media (max-width: 640px) {
  .reports-filters,
  .reports-filters--sidebar-open {
    top: 118px;
    bottom: auto;
  }

  .reports-filters .reports-filters__panel {
    top: calc(100% + 0.5rem);
    bottom: auto;
  }
}

.reports-filters__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 44px;
  height: 44px;
  padding: 0 14px 0 12px;
  font: 600 0.85rem var(--font-body);
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
  cursor: pointer;
}

.reports-filters__toggle:hover {
  background: var(--color-background);
}

.reports-filters__toggle svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.reports-filters__panel {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  width: 220px;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
}

.reports-filters__help {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--color-text-muted);
}

.reports-filters__help a {
  color: var(--color-primary);
  font-weight: 600;
}

.reports-filters__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.reports-filters__field select {
  border: 2px solid rgba(26, 62, 47, 0.1);
  border-radius: var(--radius-card);
  padding: 0.4rem;
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--color-text);
}

.reports-filters__period-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.reports-filters__period-option {
  flex: 1;
  min-width: 60px;
  padding: 0.35rem 0.4rem;
  border: 2px solid rgba(26, 62, 47, 0.1);
  border-radius: var(--radius-pill);
  background: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 0.75rem;
  cursor: pointer;
}

.reports-filters__period-option--selected {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-surface);
}
</style>

<style>
.report-marker__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  color: white;
}

.report-marker__badge svg {
  width: 16px;
  height: 16px;
}

.report-popup {
  max-width: 220px;
}

.report-popup__meta {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0.2rem 0 0.4rem;
  text-transform: capitalize;
}

.report-popup__severity {
  font-weight: 600;
}

.report-popup__photo {
  width: 100%;
  border-radius: 4px;
  margin-bottom: 0.4rem;
}

.report-popup p {
  margin: 0;
  font-size: 0.85rem;
}
</style>
