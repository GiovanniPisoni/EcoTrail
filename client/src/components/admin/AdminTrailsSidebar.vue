<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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
  },
  expandSelected: {
    type: Boolean,
    default: false
  },
  attentionTrails: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['select', 'pick-attention'])

const root = ref(null)

const expanded = computed(() => props.expandSelected && props.selectedId != null)
const listedTrails = computed(() =>
  expanded.value ? props.trails.filter((trail) => !isSelected(trail)) : props.trails
)
let scrolledId = null

async function scrollToSelected() {
  if (!props.selectedId) {
    scrolledId = null
    return
  }

  await nextTick()

  const list = root.value
  const item = list?.querySelector(`[data-trail-id="${props.selectedId}"]`)
  if (!list || !item) return
  scrolledId = props.selectedId

  const offset = item.getBoundingClientRect().top - list.getBoundingClientRect().top
  list.scrollTo({ top: list.scrollTop + offset - 8, behavior: 'auto' })
}

watch(() => props.selectedId, scrollToSelected)
watch(
  () => props.trails,
  () => {
    if (props.selectedId && scrolledId !== props.selectedId) scrollToSelected()
  }
)
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
</script>

<template>
  <aside ref="root" class="admin-trails-sidebar">
    <div class="admin-trails-sidebar__header">
      <h2 class="admin-trails-sidebar__title">Trails</h2>
    </div>

    <div v-if="expanded" class="admin-trails-sidebar__expanded">
      <button
        type="button"
        class="admin-trails-sidebar__close"
        @click="emit('select', props.selectedId)"
      >
        Close trail
      </button>
      <slot name="selected" />
    </div>

    <section
      v-if="attentionTrails.length > 0 && !expanded"
      class="admin-trails-sidebar__attention"
      aria-labelledby="needs-attention-title"
    >
      <h3 id="needs-attention-title" class="admin-trails-sidebar__attention-title">
        Needs attention ({{ attentionTrails.length }})
      </h3>
      <ul class="admin-trails-sidebar__list">
        <li v-for="trail in attentionTrails" :key="trail.id">
          <BaseCard
            class="admin-trails-sidebar__item"
            :class="{ 'admin-trails-sidebar__item--selected': selectedId === String(trail.id) }"
            @click="emit('pick-attention', String(trail.id))"
          >
            <span class="admin-trails-sidebar__name">
              {{ trail.name }}
              <span v-if="trail.closureProposed" class="admin-trails-sidebar__flag">
                Closure proposed
              </span>
            </span>
            <StatusBadge :status="trail.status" />
          </BaseCard>
        </li>
      </ul>
    </section>

    <p v-if="trails.length === 0 && !expanded" class="admin-trails-sidebar__empty">
      No trails in view. Move or zoom the map to see nearby trails.
    </p>

    <ul v-else-if="listedTrails.length > 0" class="admin-trails-sidebar__list">
      <li v-for="trail in listedTrails" :key="trailId(trail)" :data-trail-id="trailId(trail)">
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
.admin-trails-sidebar__attention {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.6rem;
  border-radius: var(--radius-card);
  border-left: 4px solid var(--color-status-closed, #ef4444);
  background: rgba(239, 68, 68, 0.06);
}

.admin-trails-sidebar__attention-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.admin-trails-sidebar__flag {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-status-closed, #ef4444);
}

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

.admin-trails-sidebar__expanded {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.admin-trails-sidebar__close {
  align-self: flex-end;
  padding: 0.35rem 0.8rem;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-primary);
  font-family: var(--font-body);
  font-size: 0.85rem;
  cursor: pointer;
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
