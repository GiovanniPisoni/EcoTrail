<script setup>
const props = defineProps({
  totals: { type: Object, required: true },
  events: { type: Array, required: true },
  activeType: { type: String, default: null },
  notificationRetentionDays: { type: Number, default: null }
})

const emit = defineEmits(['select'])

const KINDS = {
  closure: { label: 'Closures', color: 'var(--color-status-closed)' },
  alert: { label: 'Automatic alerts', color: 'var(--color-status-at-risk)' },
  notification: { label: 'Notifications sent', color: 'var(--color-primary)' }
}

const TOTAL_KEYS = { closure: 'closures', alert: 'alerts', notification: 'notifications' }

function toggle(kind) {
  emit('select', props.activeType === kind ? null : kind)
}

function formatDate(value) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function formatCount(event) {
  if (!event.count) return ''
  const noun = event.count === 1 ? 'hiker' : 'hikers'
  return event.kind === 'notification'
    ? `${event.count} ${noun} notified`
    : `${event.count} ${noun} alerted`
}
</script>

<template>
  <div class="events">
    <div class="events__totals">
      <button
        v-for="(meta, kind) in KINDS"
        :key="kind"
        type="button"
        class="events__total"
        :class="{ 'events__total--active': activeType === kind }"
        :aria-pressed="activeType === kind"
        :style="{ '--kind-color': meta.color }"
        @click="toggle(kind)"
      >
        <span class="events__total-value">{{ totals[TOTAL_KEYS[kind]] }}</span>
        <span class="events__total-label">{{ meta.label }}</span>
      </button>
    </div>

    <p v-if="notificationRetentionDays" class="events__note">
      Notification history is kept for {{ notificationRetentionDays }} days.
    </p>

    <p v-if="events.length === 0" class="events__empty">No events in this period</p>
    <ul v-else class="events__list">
      <li
        v-for="(event, index) in events"
        :key="`${event.kind}-${event.at}-${index}`"
        class="events__item"
        :style="{ '--kind-color': KINDS[event.kind].color }"
      >
        <span class="events__dot" aria-hidden="true" />
        <div class="events__body">
          <div class="events__headline">
            <strong>{{ KINDS[event.kind].label.replace(/s$/, '') }}</strong>
            <span v-if="event.trail"> · {{ event.trail.name }}</span>
          </div>
          <div class="events__detail">{{ event.detail }}</div>
          <div class="events__meta">
            {{ formatDate(event.at) }}
            <span v-if="formatCount(event)"> · {{ formatCount(event) }}</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.events {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.events__totals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.events__total {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  padding: 0.75rem;
  border: 2px solid transparent;
  border-left: 4px solid var(--kind-color);
  border-radius: 12px;
  background: var(--color-background);
  font-family: var(--font-body);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.events__total--active {
  border-color: var(--kind-color);
  background: var(--color-surface);
}

.events__total-value {
  font-size: 1.6rem;
  font-weight: 600;
}

.events__total-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.events__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.events__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.events__list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 360px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.events__item {
  display: flex;
  gap: 0.6rem;
}

.events__dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  margin-top: 0.35rem;
  border-radius: 50%;
  background: var(--kind-color);
}

.events__headline {
  font-size: 0.9rem;
}

.events__detail {
  font-size: 0.85rem;
  color: var(--color-text);
}

.events__meta {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

@media (max-width: 640px) {
  .events__totals {
    grid-template-columns: 1fr;
  }
}
</style>
