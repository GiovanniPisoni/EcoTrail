<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
  }
})

const emit = defineEmits(['update:latitude', 'update:longitude'])

const mapContainer = ref(null)
let map = null
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

  map.on('click', (event) => {
    emit('update:latitude', event.latlng.lat)
    emit('update:longitude', event.latlng.lng)
  })
})

onUnmounted(() => {
  map?.remove()
  map = null
})

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
  <div ref="mapContainer" class="location-picker"></div>
</template>

<style scoped>
.location-picker {
  width: 100%;
  height: 150px;
  border-radius: var(--radius-card);
  overflow: hidden;
}
</style>
