<script setup>
import { onUnmounted, watch } from 'vue'
import L from 'leaflet'
import { REPORT_TYPE_OPTIONS, REPORT_SEVERITY_OPTIONS } from '@/config/reportOptions.js'

const props = defineProps({
  map: {
    type: Object,
    required: true
  },
  reports: {
    type: Array,
    default: () => []
  },
  selectedId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['select'])

const markersById = new Map()
let layerGroup = L.layerGroup()

function reportId(report) {
  return String(report.id)
}

function severityColor(severity) {
  return REPORT_SEVERITY_OPTIONS.find((option) => option.value === severity)?.color ?? '#6b7280'
}

function buildIcon(report, selected) {
  const icon = REPORT_TYPE_OPTIONS.find((option) => option.value === report.type)?.icon ?? ''
  const size = selected ? 36 : 28

  return L.divIcon({
    className: 'admin-report-marker',
    html: `<span class="admin-report-marker__badge${selected ? ' admin-report-marker__badge--selected' : ''}" style="background:${severityColor(report.severity)}">${icon}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  })
}

function buildPopupContent(report) {
  const container = document.createElement('div')

  const title = document.createElement('strong')
  title.textContent = REPORT_TYPE_OPTIONS.find((option) => option.value === report.type)?.label ?? report.type
  container.append(title)

  container.append(document.createElement('br'))

  const meta = document.createElement('span')
  meta.textContent = `${report.severity} · ${report.trail?.name ?? 'Unknown trail'}`
  container.append(meta)

  return container
}

function renderMarkers() {
  layerGroup.clearLayers()
  markersById.clear()

  for (const report of props.reports) {
    const id = reportId(report)
    const selected = props.selectedId === id

    const marker = L.marker([report.latitude, report.longitude], {
      icon: buildIcon(report, selected),
      zIndexOffset: selected ? 1000 : 0
    })
    marker.bindPopup(buildPopupContent(report))
    marker.on('click', () => emit('select', props.selectedId === id ? null : id))

    markersById.set(id, marker)
    layerGroup.addLayer(marker)
  }
}

watch(
  () => props.reports,
  renderMarkers,
  { immediate: true }
)

watch(
  () => props.selectedId,
  (id) => {
    renderMarkers()
    if (id && markersById.has(id)) {
      const marker = markersById.get(id)
      props.map.panTo(marker.getLatLng())
      marker.openPopup()
    }
  }
)

watch(
  () => props.map,
  (map, previousMap) => {
    previousMap?.removeLayer(layerGroup)
    map?.addLayer(layerGroup)
  },
  { immediate: true }
)

onUnmounted(() => {
  layerGroup.remove()
})
</script>

<template>
  <div style="display: none"></div>
</template>

<style>
.admin-report-marker__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  color: white;
}

.admin-report-marker__badge svg {
  width: 60%;
  height: 60%;
}

.admin-report-marker__badge--selected {
  border-color: var(--color-primary);
  border-width: 3px;
}
</style>
