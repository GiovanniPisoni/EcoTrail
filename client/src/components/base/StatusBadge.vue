<script setup>
import { computed } from 'vue'
import { TRAIL_STATUSES } from '@/config/trailStatus.js'

const props = defineProps({
  status: {
    type: String,
    required: true
  },
  statuses: {
    type: Object,
    default: () => TRAIL_STATUSES
  }
})

const statusInfo = computed(() => props.statuses[props.status] ?? Object.values(props.statuses)[0])
</script>

<template>
  <span class="status-badge" :style="{ '--badge-color': statusInfo.color }">
    <span class="status-badge__icon" aria-hidden="true" v-html="statusInfo.icon"></span>
    <span>{{ statusInfo.label }}</span>
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--badge-color);
  background-color: color-mix(in srgb, var(--badge-color) 15%, white);
}

.status-badge__icon {
  display: inline-flex;
}

.status-badge__icon :deep(svg) {
  width: 14px;
  height: 14px;
}
</style>
