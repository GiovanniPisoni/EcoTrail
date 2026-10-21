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

const ALERT_COUNT_REFRESH_DELAY_MS = 3000
const ALERTS_IN_PROGRESS_WINDOW_MS = 30000
let alertCountRefreshTimer = null

function isEmergencyStatus(status) {
  return status === 'at_risk' || status === 'closed'
}

function areAlertsInProgress(entry) {
  return (
    isEmergencyStatus(entry.newStatus) &&
    !entry.alertedCount &&
    Date.now() - new Date(entry.changedAt).getTime() < ALERTS_IN_PROGRESS_WINDOW_MS
  )
}

function formatAlertedCount(entry) {
  if (entry.alertedCount) {
    return entry.alertedCount === 1 ? '1 hiker alerted' : `${entry.alertedCount} hikers alerted`
  }
  return areAlertsInProgress(entry) ? 'Sending alerts…' : 'No hikers alerted'
}

function refreshWhileAlertsInProgress() {
  clearTimeout(alertCountRefreshTimer)
  alertCountRefreshTimer = setTimeout(async () => {
    await loadHistory()
    if (history.value.some(areAlertsInProgress)) refreshWhileAlertsInProgress()
  }, ALERT_COUNT_REFRESH_DELAY_MS)
}

const trail = ref(null)
const reports = ref([])
const history = ref([])
const loading = ref(false)

const statusDraft = ref('')
const reasonDraft = ref('')
const submitting = ref(false)
const submitError = ref('')

const crowdThresholds = ref(null)
const enterDraft = ref('')
const releaseDraft = ref('')
const crowdSaving = ref(false)
const crowdError = ref('')
const crowdSaved = ref(false)

const ALERT_FIELDS = [
  { key: 'riskCount', label: 'At risk after (reliable reports)', min: 1 },
  { key: 'closeCount', label: 'Propose closure after (high-severity reports)', min: 1 },
  { key: 'windowHours', label: 'Reports from the last (hours)', min: 1 },
  { key: 'radiusMeters', label: 'Reports within (metres)', min: 50 }
]

const alertRules = ref(null)
const alertDrafts = ref({ riskCount: '', closeCount: '', windowHours: '', radiusMeters: '' })
const alertSaving = ref(false)
const alertError = ref('')
const alertSaved = ref(false)
const proposalBusy = ref(false)
const proposalError = ref('')

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

function applyCrowdThresholds(data) {
  crowdThresholds.value = data
  enterDraft.value = data.crowdThreshold ?? ''
  releaseDraft.value = data.crowdReleaseThreshold ?? ''
}

async function loadCrowdThresholds() {
  const { data } = await api.get(`/trails/${props.trailId}/crowd-thresholds`)
  applyCrowdThresholds(data)
}

function applyAlertRules(data) {
  alertRules.value = data
  for (const { key } of ALERT_FIELDS) {
    alertDrafts.value[key] = data[key] ?? ''
  }
}

async function loadAlertRules() {
  const { data } = await api.get(`/trails/${props.trailId}/alert-rules`)
  applyAlertRules(data)
}

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([
      loadTrail(),
      loadReports(),
      loadHistory(),
      loadCrowdThresholds(),
      loadAlertRules()
    ])
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

  const newStatus = statusDraft.value
  submitting.value = true
  try {
    await api.patch(`/trails/${props.trailId}/status`, {
      status: newStatus,
      reason: reasonDraft.value.trim()
    })
    statusDraft.value = ''
    reasonDraft.value = ''
    await Promise.all([loadTrail(), loadHistory(), loadAlertRules()])
    if (isEmergencyStatus(newStatus)) refreshWhileAlertsInProgress()
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
    if (event.trailId === props.trailId) refreshQuietly([loadTrail, loadHistory, loadAlertRules])
  }),
  onRealtime('report:created', (event) => {
    if (event.trailId === props.trailId) refreshQuietly([loadReports, loadAlertRules])
  }),
  onRealtime('report:updated', (event) => {
    if (event.trailId === props.trailId) refreshQuietly([loadReports, loadAlertRules])
  }),
  onRealtime(RECONNECTED, () =>
    refreshQuietly([loadTrail, loadReports, loadHistory, loadAlertRules])
  )
]

onUnmounted(() => stopRealtime.forEach((stop) => stop()))

function draftToValue(draft) {
  if (draft === '' || draft === null) return null
  return Number(draft)
}

async function saveCrowdThresholds() {
  crowdError.value = ''
  crowdSaved.value = false

  const body = {
    crowdThreshold: draftToValue(enterDraft.value),
    crowdReleaseThreshold: draftToValue(releaseDraft.value)
  }
  const invalid = Object.values(body).some((value) => value !== null && !Number.isInteger(value))
  if (invalid) {
    crowdError.value = 'Use whole numbers, or leave a field empty to use the default'
    return
  }

  crowdSaving.value = true
  try {
    const { data } = await api.patch(`/trails/${props.trailId}/crowd-thresholds`, body)
    applyCrowdThresholds(data)
    crowdSaved.value = true
  } catch (err) {
    crowdError.value = err.response?.data?.error ?? 'Failed to save the thresholds'
  } finally {
    crowdSaving.value = false
  }
}

async function saveAlertRules() {
  alertError.value = ''
  alertSaved.value = false

  const body = Object.fromEntries(
    ALERT_FIELDS.map(({ key }) => [key, draftToValue(alertDrafts.value[key])])
  )
  const invalid = Object.values(body).some((value) => value !== null && !Number.isInteger(value))
  if (invalid) {
    alertError.value = 'Use whole numbers, or leave a field empty to use the default'
    return
  }

  alertSaving.value = true
  try {
    const { data } = await api.patch(`/trails/${props.trailId}/alert-rules`, body)
    applyAlertRules(data)
    alertSaved.value = true
  } catch (err) {
    alertError.value = err.response?.data?.error ?? 'Failed to save the rules'
  } finally {
    alertSaving.value = false
  }
}

async function dismissProposal() {
  proposalError.value = ''
  proposalBusy.value = true
  try {
    const { data } = await api.delete(`/trails/${props.trailId}/closure-proposal`)
    applyAlertRules(data)
  } catch (err) {
    proposalError.value = err.response?.data?.error ?? 'Failed to dismiss the proposal'
  } finally {
    proposalBusy.value = false
  }
}

async function confirmClosure() {
  statusDraft.value = 'closed'
  reasonDraft.value = `Closed after admin review. ${alertRules.value.closureProposal.reason}`
  await changeStatus()
}

watch(() => props.trailId, loadAll, { immediate: true })

onUnmounted(() => clearTimeout(alertCountRefreshTimer))
</script>

<template>
  <div class="admin-trail-panel">
    <p v-if="loading && !trail" class="admin-trail-panel__loading">Loading trail…</p>

    <template v-else-if="trail">
      <BaseCard class="admin-trail-panel__section admin-trail-panel__trail">
        <div class="admin-trail-panel__header">
          <h3 class="admin-trail-panel__name">{{ trail.properties.name }}</h3>
          <StatusBadge :status="trail.properties.status" />
        </div>
        <BaseCard
          v-if="alertRules?.closureProposal"
          class="admin-trail-panel__subcard admin-trail-panel__proposal"
        >
          <h4 class="admin-trail-panel__section-title">Closure proposed</h4>
          <p class="admin-trail-panel__hint">
            {{ alertRules.closureProposal.reportCount }} reliable high-severity reports. Closing the
            trail needs your confirmation.
          </p>
          <p class="admin-trail-panel__hint">
            {{ alertRules.closureProposal.reason }} ({{
              formatDate(alertRules.closureProposal.proposedAt)
            }})
          </p>
          <p v-if="proposalError" class="admin-trail-panel__error">{{ proposalError }}</p>
          <div class="admin-trail-panel__proposal-actions">
            <BaseButton :disabled="submitting || proposalBusy" @click="confirmClosure">
              Close trail
            </BaseButton>
            <BaseButton
              variant="secondary"
              :disabled="submitting || proposalBusy"
              @click="dismissProposal"
            >
              Dismiss
            </BaseButton>
          </div>
        </BaseCard>
        <BaseCard class="admin-trail-panel__subcard">
          <h4 class="admin-trail-panel__section-title">Status</h4>
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
        <BaseCard v-if="crowdThresholds" class="admin-trail-panel__subcard">
          <h4 class="admin-trail-panel__section-title">Crowding alert</h4>
          <p class="admin-trail-panel__hint">
            The trail is marked as crowded when this many hikers with hike mode on are on it, and
            goes back to free when they drop to the lower number. Only app users are counted, so the
            real crowd is usually larger.
          </p>

          <form class="admin-trail-panel__status-form" @submit.prevent="saveCrowdThresholds">
            <label class="admin-trail-panel__field">
              <span>Crowded at (hikers)</span>
              <input
                v-model="enterDraft"
                type="number"
                min="2"
                step="1"
                :placeholder="`Default: ${crowdThresholds.defaults.enter}`"
                @input="crowdSaved = false"
              />
            </label>

            <label class="admin-trail-panel__field">
              <span>Back to free at (hikers)</span>
              <input
                v-model="releaseDraft"
                type="number"
                min="1"
                step="1"
                :placeholder="`Default: ${crowdThresholds.defaults.release}`"
                @input="crowdSaved = false"
              />
            </label>

            <p class="admin-trail-panel__hint">
              Currently in use: {{ crowdThresholds.effective.enter }} /
              {{ crowdThresholds.effective.release }}
            </p>

            <p v-if="crowdError" class="admin-trail-panel__error">{{ crowdError }}</p>
            <p v-else-if="crowdSaved" class="admin-trail-panel__success">Thresholds saved</p>

            <BaseButton type="submit" :disabled="crowdSaving">Save thresholds</BaseButton>
          </form>
        </BaseCard>
        <BaseCard v-if="alertRules" class="admin-trail-panel__subcard">
          <h4 class="admin-trail-panel__section-title">Automatic alerts</h4>
          <p class="admin-trail-panel__hint">
            A report counts when another user has confirmed it nearby, or its author has a good
            track record. Enough of them on this trail mark it at risk by themselves; for a closure
            the system only proposes and you decide.
          </p>

          <form class="admin-trail-panel__status-form" @submit.prevent="saveAlertRules">
            <label v-for="field in ALERT_FIELDS" :key="field.key" class="admin-trail-panel__field">
              <span>{{ field.label }}</span>
              <input
                v-model="alertDrafts[field.key]"
                type="number"
                :min="field.min"
                step="1"
                :placeholder="`Default: ${alertRules.defaults[field.key]}`"
                @input="alertSaved = false"
              />
            </label>

            <p v-if="alertError" class="admin-trail-panel__error">{{ alertError }}</p>
            <p v-else-if="alertSaved" class="admin-trail-panel__success">Rules saved</p>

            <BaseButton type="submit" :disabled="alertSaving">Save rules</BaseButton>
          </form>
        </BaseCard>
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
              <span
                v-if="report.trustScore !== undefined"
                class="admin-trail-panel__report-trust"
                title="Trust score: confirmations from other nearby users and the author's reputation"
              >
                Trust {{ report.trustScore }}
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
            <p v-if="isEmergencyStatus(entry.newStatus)" class="admin-trail-panel__timeline-alerts">
              {{ formatAlertedCount(entry) }}
            </p>
            <p class="admin-trail-panel__timeline-meta">
              {{ entry.changedBy?.email ?? 'Automatic' }} &middot; {{ formatDate(entry.changedAt) }}
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

.admin-trail-panel__trail {
  gap: 1rem;
}

.admin-trail-panel__trail .admin-trail-panel__subcard {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background-color: var(--color-background);
  box-shadow: none;
  border: 1px solid rgba(26, 62, 47, 0.12);
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
.admin-trail-panel__field input,
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

.admin-trail-panel__hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.admin-trail-panel__proposal {
  border-left: 4px solid var(--color-status-closed);
}

.admin-trail-panel__proposal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.admin-trail-panel__success {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-primary);
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

.admin-trail-panel__report-trust {
  margin-left: 0.35rem;
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary) 10%, white);
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

.admin-trail-panel__timeline-alerts {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-primary);
}

.admin-trail-panel__timeline-meta {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
</style>
