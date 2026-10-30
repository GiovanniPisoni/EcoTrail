<script setup>
import { computed, ref, watch } from 'vue'
import {
  DEFAULT_PRESET_DAYS,
  PERIOD_PRESETS,
  buildPeriodParams,
  validateCustomRange
} from '@/utils/statsPeriod.js'

const emit = defineEmits(['change'])

const mode = ref('preset')
const days = ref(DEFAULT_PRESET_DAYS)
const from = ref('')
const to = ref('')

const today = new Date().toLocaleDateString('en-CA')
const error = computed(() =>
  mode.value === 'custom' && (from.value || to.value)
    ? validateCustomRange(from.value, to.value)
    : ''
)

function selectPreset(value) {
  mode.value = 'preset'
  days.value = value
}

function selectCustom() {
  mode.value = 'custom'
}

watch(
  [mode, days, from, to],
  () => {
    const params = buildPeriodParams({
      mode: mode.value,
      days: days.value,
      from: from.value,
      to: to.value
    })
    if (params) emit('change', params)
  },
  { immediate: true }
)
</script>

<template>
  <div class="period-picker">
    <div class="period-picker__presets" role="group" aria-label="Period">
      <button
        v-for="preset in PERIOD_PRESETS"
        :key="preset.days"
        type="button"
        class="period-picker__option"
        :class="{ 'period-picker__option--active': mode === 'preset' && days === preset.days }"
        @click="selectPreset(preset.days)"
      >
        {{ preset.label }}
      </button>
      <button
        type="button"
        class="period-picker__option"
        :class="{ 'period-picker__option--active': mode === 'custom' }"
        @click="selectCustom"
      >
        Custom dates
      </button>
    </div>

    <div v-if="mode === 'custom'" class="period-picker__custom">
      <label>
        From
        <input v-model="from" type="date" :max="today" />
      </label>
      <label>
        To <span class="period-picker__optional">(optional)</span>
        <input v-model="to" type="date" :min="from || undefined" :max="today" />
      </label>
      <p class="period-picker__hint">
        {{
          from && !to ? 'Showing the selected day only' : 'Pick one day, or a start and end date'
        }}
      </p>
    </div>
    <p v-if="error" class="period-picker__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.period-picker {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.period-picker__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.period-picker__option {
  padding: 0.35rem 0.8rem;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-primary);
  font-family: var(--font-body);
  font-size: 0.85rem;
  cursor: pointer;
}

.period-picker__option--active {
  background: var(--color-primary);
  color: var(--color-surface);
}

.period-picker__custom {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
}

.period-picker__custom label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.period-picker__custom input {
  padding: 0.35rem 0.5rem;
  border: 1px solid rgba(26, 62, 47, 0.3);
  border-radius: 8px;
  font-family: var(--font-body);
  color: var(--color-text);
}

.period-picker__optional {
  font-size: 0.75rem;
}

.period-picker__hint,
.period-picker__error {
  margin: 0;
  font-size: 0.8rem;
}

.period-picker__hint {
  color: var(--color-text-muted);
}

.period-picker__error {
  color: var(--color-status-closed);
}
</style>
