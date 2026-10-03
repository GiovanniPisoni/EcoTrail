<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { TRAIL_STATUSES, getTrailStatusLabel } from '@/config/trailStatus.js'
import { REPORT_TYPE_OPTIONS, REPORT_SEVERITY_OPTIONS } from '@/config/reportOptions.js'
import { REPORT_VALIDATION_STATUSES } from '@/config/reportValidationStatus.js'
import api from '@/api/client.js'
import { onRealtime, RECONNECTED } from '@/utils/realtime.js'

const props = defineProps({
  trailId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['status-changed'])

const trail = ref(null)
const reports = ref([])
const history = ref([])
const loading = ref(false)

const statusDraft = ref('')
const reasonDraft = ref('')
const submitting = ref(false)
const submitError = ref('')

const statusOptions = computed(() =>
  Object.keys(TRAIL_STATUSES).filter((status) => status !== trail.value?.properties.status)
)

function reportTypeOption(type) {
  return REPORT_TYPE_OPTIONS.find((option) => option.value === type)
}

function severityOption(severity) {
  return REPORT_SEVERITY_OPTIONS.find((option) => option.value === severity)
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleString()
}

async function loadTrail() {
  const { data } = await api.get(`/trails/${props.trailId}`)
  trail.value = data
}

async function loadReports() {
  const { data } = await api.get('/reports/admin', {
    params: { trail: props.trailId, limit: 50 }
  })
  reports.value = data.reports
}

async function loadHistory() {
  const { data } = await api.get(`/trails/${props.trailId}/history`)
  history.value = data.history
}

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([loadTrail(), loadReports(), loadHistory()])
  } catch (err) {
    console.error('Failed to load trail details:', err)
  } finally {
    loading.value = false
  }
}

async function changeStatus() {
  submitError.value = ''

  if (!statusDraft.value) {
    submitError.value = 'Choose a new status'
    return
  }
  if (!reasonDraft.value.trim()) {
    submitError.value = 'A reason is required'
    return
  }

  submitting.value = true
  try {
    await api.patch(`/trails/${props.trailId}/status`, {
      status: statusDraft.value,
      reason: reasonDraft.value.trim()
    })
    statusDraft.value = ''
    reasonDraft.value = ''
    await Promise.all([loadTrail(), loadHistory()])
    emit('status-changed')
  } catch (err) {
    submitError.value = err.response?.data?.error ?? 'Failed to change trail status'
  } finally {
    submitting.value = false
  }
}

async function refreshQuietly(loaders) {
  try {
    await Promise.all(loaders.map((load) => load()))
  } catch (err) {
    console.error('Failed to refresh trail details:', err)
  }
}

const stopRealtime = [
  onRealtime('trail:status-changed', (event) => {
    if (event.trailId === props.trailId) refreshQuietly([loadTrail, loadHistory])
  }),
  onRealtime('report:created', (event) => {
    if (event.trailId === props.trailId) refreshQuietly([loadReports])
  }),
  onRealtime('report:updated', (event) => {
    if (event.trailId === props.trailId) refreshQuietly([loadReports])
  }),
  onRealtime(RECONNECTED, () => refreshQuietly([loadTrail, loadReports, loadHistory]))
]

onUnmounted(() => stopRealtime.forEach((stop) => stop()))

watch(() => props.trailId, loadAll, { immediate: true })
</script>

<template>
  <div class="admin-trail-panel">
    <p v-if="loading && !trail" class="admin-trail-panel__loading">Loading trail…</p>

    <template v-else-if="trail">
      <BaseCard class="admin-trail-panel__section">
        <div class="admin-trail-panel__header">
          <h3 class="admin-trail-panel__name">{{ trail.properties.name }}</h3>
          <StatusBadge :status="trail.properties.status" />
        </div>

        <form class="admin-trail-panel__status-form" @submit.prevent="changeStatus">
          <label class="admin-trail-panel__field">
            <span>New status</span>
            <select v-model="statusDraft">
              <option value="" disabled>Choose a status</option>
              <option v-for="status in statusOptions" :key="status" :value="status">
                {{ getTrailStatusLabel(status) }}
              </option>
            </select>
          </label>

          <label class="admin-trail-panel__field">
            <span>Reason</span>
            <textarea v-model="reasonDraft" rows="2" placeholder="Why is the status changing?" />
          </label>

          <p v-if="submitError" class="admin-trail-panel__error">{{ submitError }}</p>

          <BaseButton type="submit" :disabled="submitting">Change status</BaseButton>
        </form>
      </BaseCard>

      <BaseCard class="admin-trail-panel__section">
        <h4 class="admin-trail-panel__section-title">Connected reports ({{ reports.length }})</h4>
        <p v-if="reports.length === 0" class="admin-trail-panel__empty">
          No reports for this trail.
        </p>
        <ul v-else class="admin-trail-panel__reports">
          <li v-for="report in reports" :key="report.id" class="admin-trail-panel__report">
            <span
              class="admin-trail-panel__report-icon"
              v-html="reportTypeOption(report.type)?.icon"
            />
            <span class="admin-trail-panel__report-text">
              {{ reportTypeOption(report.type)?.label ?? report.type }}
              <span
                class="admin-trail-panel__report-severity"
                :style="{ '--severity-color': severityOption(report.severity)?.color }"
              >
                {{ severityOption(report.severity)?.label }}
              </span>
            </span>
            <StatusBadge :status="report.validationStatus" :statuses="REPORT_VALIDATION_STATUSES" />
          </li>
        </ul>
      </BaseCard>

      <BaseCard class="admin-trail-panel__section">
        <h4 class="admin-trail-panel__section-title">Status history</h4>
        <p v-if="history.length === 0" class="admin-trail-panel__empty">No status changes yet.</p>
        <ol v-else class="admin-trail-panel__timeline">
          <li v-for="entry in history" :key="entry.id" class="admin-trail-panel__timeline-entry">
            <div class="admin-trail-panel__timeline-change">
              {{ getTrailStatusLabel(entry.previousStatus) }} &rarr;
              {{ getTrailStatusLabel(entry.newStatus) }}
            </div>
            <p class="admin-trail-panel__timeline-reason">{{ entry.reason }}</p>
            <p class="admin-trail-panel__timeline-meta">
              {{ entry.changedBy?.email ?? 'unknown' }} &middot; {{ formatDate(entry.changedAt) }}
            </p>
          </li>
        </ol>
      </BaseCard>
    </template>
  </div>
</template>

<style scoped>
.admin-trail-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.admin-trail-panel__loading {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.admin-trail-panel__section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.admin-trail-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.admin-trail-panel__name {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.2rem;
}

.admin-trail-panel__section-title {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1rem;
}

.admin-trail-panel__status-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.admin-trail-panel__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.admin-trail-panel__field select,
.admin-trail-panel__field textarea {
  font-family: var(--font-body);
  font-size: 0.9rem;
  padding: 0.5rem;
  border: 1px solid rgba(26, 62, 47, 0.15);
  border-radius: 8px;
  resize: vertical;
}

.admin-trail-panel__error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-status-closed, #ef4444);
}

.admin-trail-panel__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.admin-trail-panel__reports {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.admin-trail-panel__report {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
}

.admin-trail-panel__report-icon {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--color-primary);
}

.admin-trail-panel__report-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.admin-trail-panel__report-text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.admin-trail-panel__report-severity {
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--severity-color);
  background-color: color-mix(in srgb, var(--severity-color) 15%, white);
}

.admin-trail-panel__timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.admin-trail-panel__timeline-entry {
  padding-left: 0.75rem;
  border-left: 2px solid rgba(26, 62, 47, 0.15);
}

.admin-trail-panel__timeline-change {
  font-weight: 600;
  font-size: 0.9rem;
}

.admin-trail-panel__timeline-reason {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
}

.admin-trail-panel__timeline-meta {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
</style>
