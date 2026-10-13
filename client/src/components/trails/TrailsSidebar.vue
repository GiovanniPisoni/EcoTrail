<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import BaseCard from '@/components/base/BaseCard.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import TrailAlternative from '@/components/trails/TrailAlternative.vue'
import { getTrailDifficultyColor, getTrailDifficultyLabel } from '@/config/trailDifficulty.js'

const props = defineProps({
  trails: {
    type: Array,
    default: () => []
  },
  selectedId: {
    type: String,
    default: null
  },
  filtered: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'select', 'focus-trail'])

const root = ref(null)

async function scrollToSelected() {
  if (!props.selectedId) return

  await nextTick()
  root.value
    ?.querySelector(`[data-trail-id="${props.selectedId}"]`)
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

watch(() => props.selectedId, scrollToSelected)
onMounted(scrollToSelected)

function trailId(trail) {
  return String(trail.properties.id)
}

function isSelected(trail) {
  return props.selectedId != null && trailId(trail) === props.selectedId
}

function onSelect(trail) {
  emit('select', isSelected(trail) ? null : trailId(trail))
}

function formatDistance(distanceKm) {
  return typeof distanceKm === 'number' ? `${distanceKm.toFixed(1)} km` : '-'
}

function formatDuration(durationMinutes) {
  if (typeof durationMinutes !== 'number') return '-'
  const hours = Math.floor(durationMinutes / 60)
  const minutes = Math.round(durationMinutes % 60)
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`
}
</script>

<template>
  <aside ref="root" class="trails-sidebar">
    <div class="trails-sidebar__header">
      <h2 class="trails-sidebar__title">Nearby trails</h2>
      <button
        type="button"
        class="trails-sidebar__close"
        title="Hide nearby trails"
        @click="emit('close')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <p v-if="trails.length === 0" class="trails-sidebar__empty">
      <template v-if="filtered">No trails match the statuses ticked in the legend.</template>
      <template v-else>No trails in view. Move or zoom the map to see nearby trails.</template>
    </p>

    <ul v-else class="trails-sidebar__list">
      <li v-for="trail in trails" :key="trailId(trail)" :data-trail-id="trailId(trail)">
        <BaseCard
          class="trails-sidebar__item"
          :class="{ 'trails-sidebar__item--selected': isSelected(trail) }"
          @click="onSelect(trail)"
        >
          <div class="trails-sidebar__row">
            <span
              class="trails-sidebar__difficulty-dot"
              :style="{ backgroundColor: getTrailDifficultyColor(trail.properties.difficulty) }"
              :title="getTrailDifficultyLabel(trail.properties.difficulty)"
            />
            <span class="trails-sidebar__name">{{ trail.properties.name }}</span>
            <StatusBadge :status="trail.properties.status" />
          </div>

          <p v-if="trail.properties.statusReason" class="trails-sidebar__reason">
            <span class="trails-sidebar__reason-label">Why:</span>
            {{ trail.properties.statusReason }}
          </p>

          <div v-if="isSelected(trail)" class="trails-sidebar__details">
            <img
              v-if="trail.properties.photoUrl"
              :src="trail.properties.photoUrl"
              :alt="trail.properties.name"
              class="trails-sidebar__photo"
            />
            <div v-else class="trails-sidebar__photo trails-sidebar__photo--placeholder">
              No photo yet
            </div>

            <dl class="trails-sidebar__stats">
              <div>
                <dt>Distance</dt>
                <dd>{{ formatDistance(trail.properties.distanceKm) }}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{{ formatDuration(trail.properties.durationMinutes) }}</dd>
              </div>
              <div>
                <dt>Difficulty</dt>
                <dd>{{ getTrailDifficultyLabel(trail.properties.difficulty) }}</dd>
              </div>
            </dl>

            <TrailAlternative
              v-if="trail.properties.status !== 'free'"
              :trail-id="trailId(trail)"
              :status="trail.properties.status"
              @show="emit('focus-trail', $event)"
            />
          </div>
        </BaseCard>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.trails-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0 1rem 1rem;
  overflow-y: auto;
}

.trails-sidebar__reason {
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
  line-height: 1.35;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.trails-sidebar__reason-label {
  font-weight: 600;
  color: var(--color-text-muted);
}

.trails-sidebar__header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0 0.5rem;
  background-color: var(--color-background);
}

.trails-sidebar__title {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.3rem;
}

.trails-sidebar__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.trails-sidebar__close:hover {
  background: var(--color-surface);
  color: var(--color-primary);
}

.trails-sidebar__close svg {
  width: 18px;
  height: 18px;
}

.trails-sidebar__empty {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.trails-sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.trails-sidebar__item {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

.trails-sidebar__item--selected {
  box-shadow: 0 0 0 2px var(--color-primary);
}

.trails-sidebar__row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.trails-sidebar__difficulty-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.trails-sidebar__name {
  flex: 1;
  font-weight: 600;
  font-size: 0.95rem;
}

.trails-sidebar__details {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.trails-sidebar__photo {
  width: 100%;
  height: 120px;
  object-fit: cover;
  border-radius: var(--radius-card);
  background-color: var(--color-background);
}

.trails-sidebar__photo--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.trails-sidebar__stats {
  display: flex;
  justify-content: space-between;
  margin: 0;
  font-size: 0.85rem;
}

.trails-sidebar__stats dt {
  color: var(--color-text-muted);
  font-weight: 400;
}

.trails-sidebar__stats dd {
  margin: 0;
  font-weight: 600;
}
</style>
