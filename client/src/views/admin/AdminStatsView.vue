<script setup>
import { computed, ref, watch } from 'vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BarChart from '@/components/stats/BarChart.vue'
import HorizontalBars from '@/components/stats/HorizontalBars.vue'
import ReportsHeatmap from '@/components/stats/ReportsHeatmap.vue'
import EventsTimeline from '@/components/stats/EventsTimeline.vue'
import StatsPeriodPicker from '@/components/stats/StatsPeriodPicker.vue'
import api from '@/api/client.js'

const params = ref(null)
const trailFilter = ref('')
const eventType = ref(null)

const TOP_TRAILS = 10

const attendance = ref({ trails: [], byHour: [] })
const heatmapPoints = ref([])
const events = ref({ totals: { closures: 0, alerts: 0, notifications: 0 }, events: [] })

const trailOptions = ref([])
const loading = ref(false)
const error = ref('')
let requestId = 0

const topTrails = computed(() => attendance.value.trails.slice(0, TOP_TRAILS))
const trailLabels = computed(() => topTrails.value.map((trail) => trail.name))
const trailValues = computed(() => topTrails.value.map((trail) => trail.hikers))
const hourLabels = computed(() =>
  attendance.value.byHour.map((slot) => `${String(slot.hour).padStart(2, '0')}:00`)
)
const hourValues = computed(() => attendance.value.byHour.map((slot) => slot.hikers))
const hasAttendance = computed(() => hourValues.value.some((value) => value > 0))

async function load() {
  if (!params.value) return

  const current = ++requestId
  loading.value = true
  error.value = ''

  try {
    const [attendanceRes, heatmapRes, eventsRes] = await Promise.all([
      api.get('/stats/attendance', {
        params: { ...params.value, ...(trailFilter.value ? { trail: trailFilter.value } : {}) }
      }),
      api.get('/stats/heatmap', { params: params.value }),
      api.get('/stats/events', {
        params: { ...params.value, ...(eventType.value ? { type: eventType.value } : {}) }
      })
    ])

    if (current !== requestId) return
    attendance.value = attendanceRes.data
    if (!trailFilter.value) {
      trailOptions.value = attendanceRes.data.trails.map((trail) => ({
        id: String(trail.trailId),
        name: trail.name
      }))
    }
    heatmapPoints.value = heatmapRes.data.points
    events.value = eventsRes.data
  } catch (err) {
    if (current !== requestId) return
    error.value = err.response?.data?.error ?? 'Could not load the statistics'
  } finally {
    if (current === requestId) loading.value = false
  }
}

function onPeriodChange(newParams) {
  params.value = newParams
}

watch([params, trailFilter, eventType], load)
</script>

<template>
  <main class="stats-page">
    <header class="stats-page__header">
      <h1>Statistics</h1>
      <StatsPeriodPicker @change="onPeriodChange" />
    </header>

    <p v-if="error" class="stats-page__error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="stats-page__loading">Loading…</p>

    <div class="stats-page__grid">
      <BaseCard class="stats-page__card">
        <h2>Hikers per trail</h2>
        <p v-if="trailLabels.length === 0" class="stats-page__empty">No activity in this period</p>
        <template v-else>
          <p v-if="attendance.trails.length > TOP_TRAILS" class="stats-page__note">
            Top {{ TOP_TRAILS }} of {{ attendance.trails.length }} trails
          </p>
          <HorizontalBars
            :labels="trailLabels"
            :values="trailValues"
            aria-label="Distinct hikers per trail"
          />
        </template>
      </BaseCard>

      <BaseCard class="stats-page__card">
        <div class="stats-page__card-head">
          <h2>Hikers by time of day</h2>
          <select v-model="trailFilter" aria-label="Filter by trail">
            <option value="">All trails</option>
            <option v-for="trail in trailOptions" :key="trail.id" :value="trail.id">
              {{ trail.name }}
            </option>
          </select>
        </div>
        <p v-if="!hasAttendance" class="stats-page__empty">No activity in this period</p>
        <div v-else class="stats-page__chart stats-page__chart--hours">
          <BarChart
            :labels="hourLabels"
            :values="hourValues"
            dataset-label="Hikers"
            aria-label="Hikers by hour of the day"
          />
        </div>
      </BaseCard>

      <BaseCard class="stats-page__card stats-page__card--wide">
        <h2>Where reports concentrate</h2>
        <div class="stats-page__heatmap">
          <ReportsHeatmap :points="heatmapPoints" />
        </div>
      </BaseCard>

      <BaseCard class="stats-page__card stats-page__card--wide">
        <h2>Event history</h2>
        <EventsTimeline
          :totals="events.totals"
          :events="events.events"
          :active-type="eventType"
          :notification-retention-days="events.notificationRetentionDays"
          @select="eventType = $event"
        />
      </BaseCard>
    </div>
  </main>
</template>

<style scoped>
.stats-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 1.5rem 2rem;
}

.stats-page__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.stats-page__header h1 {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 400;
}

.stats-page__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.stats-page__card {
  min-width: 0;
}

.stats-page__card h2 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}

.stats-page__card--wide {
  grid-column: 1 / -1;
}

.stats-page__card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.stats-page__card-head select {
  flex: 0 1 16rem;
  min-width: 0;
  max-width: 100%;
  text-overflow: ellipsis;
  padding: 0.3rem 0.5rem;
  border: 1px solid rgba(26, 62, 47, 0.3);
  border-radius: 8px;
  font-family: var(--font-body);
}

.stats-page__chart--hours {
  height: 260px;
}

.stats-page__heatmap {
  height: 380px;
  overflow: hidden;
  border-radius: 12px;
}

.stats-page__note {
  margin: 0 0 0.5rem;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.stats-page__empty,
.stats-page__loading {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.stats-page__error {
  margin: 0;
  color: var(--color-status-closed);
}

@media (max-width: 800px) {
  .stats-page {
    padding: 1rem;
  }

  .stats-page__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
