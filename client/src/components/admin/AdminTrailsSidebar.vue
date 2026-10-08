<script setup>
import BaseCard from '@/components/base/BaseCard.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'

const props = defineProps({
  trails: {
    type: Array,
    default: () => []
  },
  selectedId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['select'])

function trailId(trail) {
  return String(trail.properties.id)
}

function isSelected(trail) {
  return props.selectedId != null && trailId(trail) === props.selectedId
}

function onSelect(trail) {
  emit('select', isSelected(trail) ? null : trailId(trail))
}
</script>

<template>
  <aside class="admin-trails-sidebar">
    <div class="admin-trails-sidebar__header">
      <h2 class="admin-trails-sidebar__title">Trails</h2>
    </div>

    <p v-if="trails.length === 0" class="admin-trails-sidebar__empty">
      No trails in view. Move or zoom the map to see nearby trails.
    </p>

    <ul v-else class="admin-trails-sidebar__list">
      <li v-for="trail in trails" :key="trailId(trail)">
        <BaseCard
          class="admin-trails-sidebar__item"
          :class="{ 'admin-trails-sidebar__item--selected': isSelected(trail) }"
          @click="onSelect(trail)"
        >
          <span class="admin-trails-sidebar__name">{{ trail.properties.name }}</span>
          <StatusBadge :status="trail.properties.status" />
        </BaseCard>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.admin-trails-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  overflow-y: auto;
}

.admin-trails-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.admin-trails-sidebar__title {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.3rem;
}

.admin-trails-sidebar__empty {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.admin-trails-sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.admin-trails-sidebar__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

.admin-trails-sidebar__item--selected {
  box-shadow: 0 0 0 2px var(--color-primary);
}

.admin-trails-sidebar__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 0.95rem;
}
</style>
