<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '@/api/client.js'
import { TRAIL_STATUSES, getTrailStatusColor, getTrailStatusLabel } from '@/config/trailStatus.js'
import { onRealtime, RECONNECTED } from '@/utils/realtime.js'
import { downloadArea } from '@/utils/offlineArea.js'

const PILOT_AREA_CENTER = [46.1667, 10.9167]
const PILOT_AREA_ZOOM = 13

const props = defineProps({
  selectedTrailId: {
    type: String,
    default: null
  },
  focusTrailId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['trails-loaded', 'trail-selected', 'map-ready'])

const mapContainer = ref(null)
let map = null
let trailsLayer = null
let lastTrailsData = null
let resizeObserver = null
let stopRealtime = []

function buildPopupContent(feature) {
  const container = document.createElement('div')

  const title = document.createElement('strong')
  title.textContent = feature.properties.name
  container.append(title)

  container.append(document.createElement('br'))

  const status = document.createElement('span')
  status.textContent = getTrailStatusLabel(feature.properties.status)
  container.append(status)

  return container
}

function renderTrailsLayer() {
  if (!lastTrailsData) return

  trailsLayer?.remove()
  trailsLayer = L.geoJSON(lastTrailsData, {
    filter: (feature) =>
      !props.selectedTrailId || String(feature.properties.id) === String(props.selectedTrailId),
    style: (feature) => ({
      color: getTrailStatusColor(feature.properties.status),
      weight: props.selectedTrailId ? 6 : 4
    }),
    onEachFeature: (feature, layer) => {
      layer.bindPopup(buildPopupContent(feature))
      layer.on('click', () => emit('trail-selected', String(feature.properties.id)))
    }
  }).addTo(map)
}

async function loadTrails() {
  const bounds = map.getBounds()
  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')

  let data
  try {
    ;({ data } = await api.get('/trails', { params: { bbox } }))
  } catch (err) {
    console.error('Failed to load trails:', err)
    return
  }

  lastTrailsData = data
  renderTrailsLayer()

  emit('trails-loaded', data.features ?? [])
}

watch(
  () => props.selectedTrailId,
  () => renderTrailsLayer()
)

let locationMarker = null

function locateUser() {
  if (!navigator.geolocation) {
    console.error('Geolocation is not supported by this browser.')
    return
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords
      map.setView([latitude, longitude], 15)

      locationMarker?.remove()
      locationMarker = L.circleMarker([latitude, longitude], {
        radius: 8,
        color: '#1976d2',
        fillColor: '#1976d2',
        fillOpacity: 0.8
      }).addTo(map)
    },
    (err) => {
      console.error('Failed to get current location:', err)
    }
  )
}

function addLocateControl() {
  const control = L.control({ position: 'topleft' })

  control.onAdd = () => {
    const button = L.DomUtil.create('button', 'locate-button')
    button.type = 'button'
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/><circle cx="12" cy="9" r="0.6" fill="currentColor" stroke="none"/></svg>'
    button.title = 'Center on my location'
    L.DomEvent.disableClickPropagation(button)
    button.addEventListener('click', locateUser)
    return button
  }

  control.addTo(map)
}

let downloading = false

function addDownloadControl() {
  const control = L.control({ position: 'topleft' })

  control.onAdd = () => {
    const wrapper = L.DomUtil.create('div', 'download-area')
    const button = L.DomUtil.create('button', 'locate-button', wrapper)
    button.type = 'button'
    button.title = 'Download this area for offline use'
    button.setAttribute('aria-label', button.title)
    const icon =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>'
    button.innerHTML = icon

    const message = L.DomUtil.create('div', 'download-area-message', wrapper)
    message.hidden = true
    let hideTimer = null

    const show = (text, keep = false) => {
      clearTimeout(hideTimer)
      message.textContent = text
      message.hidden = false
      if (!keep) hideTimer = setTimeout(() => (message.hidden = true), 4000)
    }

    L.DomEvent.disableClickPropagation(wrapper)
    button.addEventListener('click', async () => {
      if (downloading) return
      downloading = true
      button.disabled = true
      show('Downloading…', true)
      try {
        const result = await downloadArea(map, (progress) => {
          show(`Downloading… ${Math.round(progress * 100)}%`, true)
        })
        show(
          result.failed
            ? `Area saved, ${result.failed} map tiles could not be downloaded.`
            : 'Area saved for offline use.'
        )
      } catch (err) {
        show(err.message || 'Download failed.')
      } finally {
        downloading = false
        button.disabled = false
      }
    })

    return wrapper
  }

  control.addTo(map)
}

function addLegend() {
  const legend = L.control({ position: 'topright' })

  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'trail-legend')

    Object.values(TRAIL_STATUSES).forEach(({ label, color, icon }) => {
      const item = document.createElement('div')
      item.className = 'trail-legend-item'

      const swatch = document.createElement('span')
      swatch.className = 'trail-legend-swatch'
      swatch.style.backgroundColor = color
      item.append(swatch)

      const text = document.createElement('span')
      text.innerHTML = `<span class="trail-legend-icon">${icon}</span> ${label}`
      item.append(text)

      div.append(item)
    })

    return div
  }

  legend.addTo(map)
}

async function focusOnTrail(trailId) {
  let feature
  try {
    ;({ data: feature } = await api.get(`/trails/${trailId}`))
  } catch (err) {
    console.error('Failed to load the trail to focus on:', err)
    return false
  }

  const bounds = L.geoJSON(feature).getBounds()
  if (!bounds.isValid()) return false

  map.fitBounds(bounds, { maxZoom: 16 })
  emit('trail-selected', String(feature.properties.id))
  return true
}

onMounted(async () => {
  map = L.map(mapContainer.value).setView(PILOT_AREA_CENTER, PILOT_AREA_ZOOM)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map)

  addLocateControl()
  addDownloadControl()
  addLegend()

  resizeObserver = new ResizeObserver(() => {
    map?.invalidateSize()
  })
  resizeObserver.observe(mapContainer.value)

  map.on('moveend zoomend', loadTrails)

  stopRealtime = [
    onRealtime('trail:status-changed', loadTrails),
    onRealtime(RECONNECTED, loadTrails)
  ]

  const focused = props.focusTrailId && (await focusOnTrail(props.focusTrailId))
  if (!focused) loadTrails()

  emit('map-ready', map)
})

onUnmounted(() => {
  stopRealtime.forEach((stop) => stop())
  stopRealtime = []
  resizeObserver?.disconnect()
  resizeObserver = null
  map?.remove()
  map = null
})

defineExpose({ refresh: loadTrails })
</script>

<template>
  <div ref="mapContainer" class="trails-map"></div>
</template>

<style scoped>
.trails-map {
  width: 100%;
  height: 100%;
  min-height: 500px;
}
</style>

<style>
.locate-button {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface);
  border: none;
  border-radius: var(--radius-pill);
  width: 44px;
  height: 44px;
  cursor: pointer;
  color: var(--color-primary);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
}

.locate-button svg {
  width: 22px;
  height: 22px;
}

.locate-button:hover {
  background: var(--color-background);
}

.download-area {
  position: relative;
}

.download-area-message {
  position: absolute;
  top: 0;
  left: 52px;
  width: max-content;
  max-width: 220px;
  padding: 8px 12px;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.85rem;
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
}

.download-area .locate-button:disabled {
  opacity: 0.6;
  cursor: progress;
}

.leaflet-control-zoom {
  border: none !important;
  border-radius: var(--radius-card) !important;
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12) !important;
  overflow: hidden;
}

.leaflet-control-zoom a {
  background-color: var(--color-surface) !important;
  color: var(--color-primary) !important;
  border: none !important;
  width: 40px !important;
  height: 40px !important;
  line-height: 40px !important;
  font-size: 1.2rem !important;
}

.leaflet-control-zoom a:hover {
  background-color: var(--color-background) !important;
}

.trail-legend {
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(10px);
  padding: 8px 10px;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  font-size: 0.85rem;
  line-height: 1.6;
}

.trail-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.trail-legend-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.trail-legend-icon {
  display: inline-flex;
  vertical-align: -3px;
}

.trail-legend-icon svg {
  width: 14px;
  height: 14px;
}
</style>
