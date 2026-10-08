<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import L from 'leaflet'
import 'leaflet.heat'
import 'leaflet/dist/leaflet.css'

const PILOT_AREA_CENTER = [46.1667, 10.9167]
const PILOT_AREA_ZOOM = 12
const HEAT_FULL_INTENSITY_ZOOM = 10

const props = defineProps({
  points: { type: Array, required: true }
})

const container = ref(null)
const map = shallowRef(null)
let heatLayer = null

function render() {
  if (!map.value) return

  const points = props.points
  if (!heatLayer) {
    heatLayer = L.heatLayer(points, {
      radius: 26,
      blur: 20,
      maxZoom: HEAT_FULL_INTENSITY_ZOOM,
      max: 1.2
    }).addTo(map.value)
  } else {
    heatLayer.setLatLngs(points)
  }

  if (points.length > 0) {
    map.value.fitBounds(L.latLngBounds(points.map(([lat, lng]) => [lat, lng])), {
      padding: [30, 30],
      maxZoom: 15
    })
  } else {
    map.value.setView(PILOT_AREA_CENTER, PILOT_AREA_ZOOM)
  }
}

onMounted(() => {
  map.value = L.map(container.value).setView(PILOT_AREA_CENTER, PILOT_AREA_ZOOM)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map.value)

  render()
})

watch(() => props.points, render)

onBeforeUnmount(() => {
  map.value?.remove()
  map.value = null
  heatLayer = null
})
</script>

<template>
  <div class="reports-heatmap">
    <div ref="container" class="reports-heatmap__map" />
    <p v-if="points.length === 0" class="reports-heatmap__empty">No reports in this period</p>
  </div>
</template>

<style scoped>
.reports-heatmap {
  position: relative;
  width: 100%;
  height: 100%;
}

.reports-heatmap__map {
  width: 100%;
  height: 100%;
}

.reports-heatmap__empty {
  position: absolute;
  top: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 500;
  margin: 0;
  padding: 0.35rem 0.8rem;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.2);
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
</style>
