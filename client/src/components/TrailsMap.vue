<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '@/api/client.js'

const PILOT_AREA_CENTER = [46.1667, 10.9167]
const PILOT_AREA_ZOOM = 13

const mapContainer = ref(null)
let map = null
let trailsLayer = null

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
  trailsLayer = L.geoJSON(data).addTo(map)
}

onMounted(() => {
  map = L.map(mapContainer.value).setView(PILOT_AREA_CENTER, PILOT_AREA_ZOOM)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map)

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
