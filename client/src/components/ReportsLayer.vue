<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import api from '@/api/client.js'
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

  // Reuse the same cluster group and just swap its markers, instead of removing it from the
  // map and adding a brand new one on every reload: that churn is what made the previous
  // dots look "stuck" mid-zoom when a reload landed while the zoom gesture was still going.
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

  // Zooming/panning fires several moveend events in a row, each starting its own request;
  // ignore this response if a newer request has since been started, so a slow, stale reply
  // can't overwrite what the current viewport should show.
  if (seq !== requestSeq) return

  lastReportsData = data
  renderReportsLayer()
}

function scheduleLoadReports() {
  clearTimeout(moveTimer)
  moveTimer = setTimeout(loadReports, 200)
}

watch([typeFilter, periodFilter], loadReports)

onMounted(() => {
  clusterGroup = L.markerClusterGroup({
    // Leaflet.markercluster only recomputes cluster grouping at zoomend, never mid-gesture,
    // so at a close zoom (where dots are far enough apart to matter individually) the old
    // grouping visibly lagging behind the map was the "stuck" look reported while zooming.
    // Past this zoom, show every report as its own marker instead of clustering at all.
    disableClusteringAtZoom: 16
  })
  clusterGroup.addTo(props.map)

  props.map.on('moveend zoomend', scheduleLoadReports)
  loadReports()
})

onUnmounted(() => {
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
      title="Filter reports"
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
    </button>

    <div v-if="filtersOpen" class="reports-filters__panel">
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
/* Positioned relative to the map container (like Leaflet's own zoom control), not the
   page: it then follows the map for free whenever it resizes, e.g. when the sidebar
   toggles, instead of jumping between hand-picked page-relative offsets. */
.reports-filters {
  position: absolute;
  left: 10px;
  bottom: 62px;
  z-index: 1000;
}

/* With the sidebar open there is no "reopen" icon to stack above. */
.reports-filters--sidebar-open {
  bottom: 10px;
}

.reports-filters__toggle {
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

.reports-filters__toggle:hover {
  background: var(--color-background);
}

.reports-filters__toggle svg {
  width: 20px;
  height: 20px;
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
