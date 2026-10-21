<script setup>
defineProps({
  searchOnly: {
    type: Boolean,
    default: false
  }
})
</script>

<template>
  <div class="admin-map-frame" :class="{ 'admin-map-frame--search-only': searchOnly }">
    <slot />
  </div>
</template>

<style scoped>
.admin-map-frame {
  position: relative;
  width: 100%;
  height: 100%;
}

.admin-map-frame :deep(.map-search) {
  left: 140px;
  right: 150px;
  width: auto;
  max-width: 380px;
  transform: none;
}

.admin-map-frame--search-only :deep(.map-search) {
  left: 10px;
  right: 10px;
}

.admin-map-frame :deep(.trail-legend) {
  padding: 5px 8px;
  font-size: 0.75rem;
  line-height: 1.5;
}

.admin-map-frame :deep(.trail-legend-title) {
  font-size: 0.68rem;
}

.admin-map-frame :deep(.trail-legend-item) {
  gap: 4px;
}

.admin-map-frame :deep(.trail-legend-checkbox) {
  width: 14px;
  height: 14px;
}

.admin-map-frame :deep(.locate-button) {
  min-width: 36px;
  height: 36px;
  padding: 0 10px 0 8px;
  font-size: 0.75rem;
  gap: 6px;
}

.admin-map-frame :deep(.locate-button svg) {
  width: 18px;
  height: 18px;
}

@media (max-width: 640px) {
  .admin-map-frame :deep(.leaflet-control-zoom) {
    display: none;
  }

  .admin-map-frame :deep(.leaflet-top) {
    margin-top: 52px;
  }

  .admin-map-frame :deep(.leaflet-left .leaflet-control) {
    margin-left: 8px;
    margin-top: 6px;
  }

  .admin-map-frame :deep(.leaflet-right .leaflet-control) {
    margin-right: 8px;
    margin-top: 6px;
  }

  .admin-map-frame :deep(.map-search) {
    left: 8px;
    right: 8px;
    max-width: none;
  }

  .admin-map-frame :deep(.map-search__form) {
    height: 40px;
  }
}
</style>
