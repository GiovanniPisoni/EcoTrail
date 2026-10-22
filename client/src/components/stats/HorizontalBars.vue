<script setup>
import { computed } from 'vue'

const props = defineProps({
  labels: { type: Array, required: true },
  values: { type: Array, required: true },
  ariaLabel: { type: String, default: 'Bar chart' }
})

const max = computed(() => Math.max(1, ...props.values))
const summary = computed(
  () => `${props.ariaLabel}: ${props.labels.map((l, i) => `${l} ${props.values[i]}`).join(', ')}`
)

function width(value) {
  return `${(value / max.value) * 100}%`
}
</script>

<template>
  <div class="hbars" role="img" :aria-label="summary">
    <ul class="hbars__labels" aria-hidden="true">
      <li v-for="label in labels" :key="label" :title="label">{{ label }}</li>
    </ul>
    <div class="hbars__scroll" aria-hidden="true">
      <ul class="hbars__tracks">
        <li v-for="(value, index) in values" :key="labels[index]">
          <span class="hbars__bar" :style="{ width: width(value) }" />
          <span class="hbars__value">{{ value }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.hbars {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.hbars ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.hbars li {
  display: flex;
  align-items: center;
  height: 2.25rem;
}

.hbars__labels {
  flex: 0 0 min(45%, 11rem);
  min-width: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.hbars__labels li {
  justify-content: flex-end;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hbars__scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.hbars__tracks {
  min-width: 320px;
  padding-right: 2rem;
}

.hbars__tracks li {
  gap: 0.4rem;
}

.hbars__bar {
  display: block;
  height: 1.5rem;
  border-radius: 4px;
  background-color: #1a3e2f;
}

.hbars__value {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
</style>
