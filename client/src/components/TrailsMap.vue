<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '@/api/client.js'
import { TRAIL_STATUSES, getTrailStatusColor, getTrailStatusLabel } from '@/config/trailStatus.js'

const PILOT_AREA_CENTER = [46.1667, 10.9167]
const PILOT_AREA_ZOOM = 13

const mapContainer = ref(null)
let map = null
let trailsLayer = null

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

  trailsLayer?.remove()
  trailsLayer = L.geoJSON(data, {
    style: (feature) => ({
      color: getTrailStatusColor(feature.properties.status),
      weight: 4,
    }),
    onEachFeature: (feature, layer) => {
      layer.bindPopup(buildPopupContent(feature))
    },
  }).addTo(map)
}

function addLegend() {
  const legend = L.control({ position: 'bottomright' })

  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'trail-legend')

    Object.values(TRAIL_STATUSES).forEach(({ label, color }) => {
      const item = document.createElement('div')
      item.className = 'trail-legend-item'

      const swatch = document.createElement('span')
      swatch.className = 'trail-legend-swatch'
      swatch.style.backgroundColor = color
      item.append(swatch)

      const text = document.createElement('span')
      text.textContent = label
      item.append(text)

      div.append(item)
    })

    return div
  }

  legend.addTo(map)
}

onMounted(() => {
  map = L.map(mapContainer.value).setView(PILOT_AREA_CENTER, PILOT_AREA_ZOOM)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map)

  addLegend()

  map.on('moveend zoomend', loadTrails)
  loadTrails()
})

onUnmounted(() => {
  map?.remove()
  map = null
})
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
.trail-legend {
  background: white;
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
</style>
