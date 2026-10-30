<script setup>
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '@/api/client.js'
import MapSearch from '@/components/trails/MapSearch.vue'
import { getTrailStatusColor } from '@/config/trailStatus.js'

const props = defineProps({
  latitude: {
    type: Number,
    default: null
  },
  longitude: {
    type: Number,
    default: null
  },
  accuracyMeters: {
    type: Number,
    default: null
  },
  focusBounds: {
    type: Array,
    default: null
  }
})

const emit = defineEmits(['update:latitude', 'update:longitude'])

const MIN_TRAILS_ZOOM = 11

const mapContainer = ref(null)
const mapInstance = shallowRef(null)
let map = null
let trailsLayer = null
let trailsRequest = 0
let marker = null
let accuracyCircle = null

const REPORT_PIN_ICON = L.divIcon({
  className: 'report-location-pin',
  html: '<svg viewBox="0 0 24 24" fill="none" stroke="#1a3e2f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/><circle cx="12" cy="9" r="0.6" fill="#1a3e2f" stroke="none"/></svg>',
  iconSize: [30, 30],
  iconAnchor: [15, 28]
})

function setMarker(latitude, longitude) {
  marker?.remove()
  marker = L.marker([latitude, longitude], { draggable: true, icon: REPORT_PIN_ICON }).addTo(map)
  marker.on('dragend', () => {
    const { lat, lng } = marker.getLatLng()
    emit('update:latitude', lat)
    emit('update:longitude', lng)
  })
}

function setAccuracyCircle(latitude, longitude, accuracyMeters) {
  accuracyCircle?.remove()
  if (!accuracyMeters) return
  accuracyCircle = L.circle([latitude, longitude], {
    radius: accuracyMeters,
    color: '#1a3e2f',
    weight: 1,
    fillOpacity: 0.08
  }).addTo(map)
}

function showBounds(bounds) {
  map.fitBounds(bounds, { maxZoom: 16, padding: [20, 20] })
}

async function loadTrails() {
  if (!map) return

  if (map.getZoom() < MIN_TRAILS_ZOOM) {
    trailsLayer?.remove()
    trailsLayer = null
    return
  }

  const current = ++trailsRequest
  const bounds = map.getBounds()
  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')

  try {
    const { data } = await api.get('/trails', { params: { bbox } })
    if (!map || current !== trailsRequest) return

    trailsLayer?.remove()
    trailsLayer = L.geoJSON(data, {
      style: (feature) => ({
        color: getTrailStatusColor(feature.properties.status),
        weight: 4,
        opacity: 0.85
      }),
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(feature.properties.name, { sticky: true })
      }
    }).addTo(map)
  } catch (err) {
    console.error('Failed to load the trails on the location map:', err)
  }
}

onMounted(() => {
  const initialCenter = [props.latitude ?? 46.1667, props.longitude ?? 10.9167]

  map = L.map(mapContainer.value, { zoomControl: false }).setView(initialCenter, 15)
  L.control.zoom({ position: 'bottomright' }).addTo(map)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map)

  if (props.latitude != null && props.longitude != null) {
    setMarker(props.latitude, props.longitude)
    setAccuracyCircle(props.latitude, props.longitude, props.accuracyMeters)
  }

  mapInstance.value = map
  map.on('moveend', loadTrails)
  if (props.focusBounds && props.latitude == null) showBounds(props.focusBounds)
  else loadTrails()

  map.on('click', (event) => {
    emit('update:latitude', event.latlng.lat)
    emit('update:longitude', event.latlng.lng)
  })
})

onUnmounted(() => {
  map?.remove()
  map = null
  mapInstance.value = null
  trailsLayer = null
})

watch(
  () => props.focusBounds,
  (bounds) => {
    if (map && bounds && props.latitude == null) showBounds(bounds)
  }
)

watch(
  () => [props.latitude, props.longitude],
  ([latitude, longitude]) => {
    if (!map || latitude == null || longitude == null) return
    setMarker(latitude, longitude)
    setAccuracyCircle(latitude, longitude, props.accuracyMeters)
    map.panTo([latitude, longitude])
  }
)
</script>

<template>
  <div class="location-picker-wrap">
    <div ref="mapContainer" class="location-picker"></div>
    <MapSearch v-if="mapInstance" :map="mapInstance" />
  </div>
</template>

<style scoped>
.location-picker-wrap {
  position: relative;
}

.location-picker-wrap :deep(.map-search) {
  left: 10px;
  right: 10px;
  width: auto;
  transform: none;
}

.location-picker {
  width: 100%;
  height: 260px;
  border-radius: var(--radius-card);
  overflow: hidden;
}
</style>
