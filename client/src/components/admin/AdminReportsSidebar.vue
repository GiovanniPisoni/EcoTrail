<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { REPORT_TYPE_OPTIONS, REPORT_SEVERITY_OPTIONS } from '@/config/reportOptions.js'
import api from '@/api/client.js'
import { onRealtime, RECONNECTED } from '@/utils/realtime.js'

const props = defineProps({
  selectedId: {
    type: String,
    default: null
  },
  pendingCount: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['select', 'reports-loaded', 'reviewed'])

const TAB_OPTIONS = [
  { value: 'pending', label: 'Review queue' },
  { value: 'suspicious', label: 'Suspicious' },
  { value: 'validated', label: 'Verified logs' },
  { value: 'rejected', label: 'Rejected' }
]

const tab = ref('pending')
const severityFilter = ref('')
const reports = ref([])
const loading = ref(false)
const noteDraft = ref('')
const reviewing = ref(false)
const suspiciousCount = ref(null)
const spamConfirmId = ref(null)

const REVIEWABLE_TABS = ['pending', 'suspicious']
const REVISABLE_TABS = ['validated', 'rejected']
const FEEDBACK_MS = 4000
const feedback = ref('')
let feedbackTimer = null

function showFeedback(message) {
  feedback.value = message
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => {
    feedback.value = ''
  }, FEEDBACK_MS)
}

function isRevisable() {
  return REVISABLE_TABS.includes(tab.value)
}

function canAddNote() {
  return isReviewable() || isRevisable()
}

function isReviewable() {
  return REVIEWABLE_TABS.includes(tab.value)
}

function tabLabel(option) {
  if (option.value === 'pending' && props.pendingCount !== null) {
    return `${option.label} (${props.pendingCount})`
  }
  if (option.value === 'suspicious' && suspiciousCount.value) {
    return `${option.label} (${suspiciousCount.value})`
  }
  return option.label
}

function reportId(report) {
  return String(report.id)
}

function isSelected(report) {
  return props.selectedId != null && reportId(report) === props.selectedId
}

function reportTypeOption(type) {
  return REPORT_TYPE_OPTIONS.find((option) => option.value === type)
}

function severityOption(severity) {
  return REPORT_SEVERITY_OPTIONS.find((option) => option.value === severity)
}

function timeAgo(isoDate) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(isoDate).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function tabParams() {
  if (tab.value === 'pending') return { validationStatus: 'pending', suspicious: false }
  if (tab.value === 'suspicious') return { validationStatus: 'pending', suspicious: true }
  return { validationStatus: tab.value }
}

async function loadSuspiciousCount() {
  try {
    const { data } = await api.get('/reports/admin', {
      params: { validationStatus: 'pending', suspicious: true, limit: 1 }
    })
    suspiciousCount.value = data.pagination.total
  } catch (err) {
    console.error('Failed to load the suspicious reports count:', err)
  }
}

let latestLoad = 0

async function loadReports() {
  const thisLoad = ++latestLoad
  loading.value = true
  loadSuspiciousCount()
  try {
    const { data } = await api.get('/reports/admin', {
      params: {
        ...tabParams(),
        severity: severityFilter.value || undefined,
        limit: 100
      }
    })
    if (thisLoad !== latestLoad) return
    reports.value = data.reports
    emit('reports-loaded', data.reports)
  } catch (err) {
    console.error('Failed to load reports:', err)
  } finally {
    if (thisLoad === latestLoad) loading.value = false
  }
}

function onSelect(report) {
  const id = isSelected(report) ? null : reportId(report)
  noteDraft.value = ''
  spamConfirmId.value = null
  emit('select', id)
}

async function rejectAsSpam(report) {
  if (spamConfirmId.value !== reportId(report)) {
    spamConfirmId.value = reportId(report)
    return
  }
  await review(report, 'rejected', { spam: true })
}

async function review(report, status, { spam } = {}) {
  reviewing.value = true
  try {
    await api.patch(`/reports/${reportId(report)}/validate`, {
      status,
      note: noteDraft.value.trim() || undefined,
      spam
    })
    spamConfirmId.value = null
    showFeedback(
      status === 'validated'
        ? 'Report validated.'
        : spam
          ? 'Report rejected as spam. The author’s reputation was lowered.'
          : 'Report rejected.'
    )
    emit('select', null)
    emit('reviewed')
    await loadReports()
  } catch (err) {
    console.error('Failed to review report:', err)
  } finally {
    reviewing.value = false
  }
}

watch([tab, severityFilter], loadReports)

function onRemoteChange() {
  emit('reviewed')
  loadReports()
}

let stopRealtime = []

onMounted(() => {
  loadReports()
  stopRealtime = [
    onRealtime('report:created', onRemoteChange),
    onRealtime('report:updated', onRemoteChange),
    onRealtime(RECONNECTED, onRemoteChange)
  ]
})

onUnmounted(() => {
  clearTimeout(feedbackTimer)
  stopRealtime.forEach((stop) => stop())
  stopRealtime = []
})
</script>

<template>
  <aside class="admin-reports-sidebar">
    <div class="admin-reports-sidebar__header">
      <h2 class="admin-reports-sidebar__title">Reports</h2>
      <div v-if="pendingCount !== null" class="admin-reports-sidebar__pending-stat">
        <span class="admin-reports-sidebar__pending-dot" />
        <span>{{ pendingCount }} waiting for review</span>
      </div>
    </div>

    <p v-if="feedback" class="admin-reports-sidebar__feedback" role="status">{{ feedback }}</p>

    <div class="admin-reports-sidebar__tabs">
      <button
        v-for="option in TAB_OPTIONS"
        :key="option.value"
        type="button"
        class="admin-reports-sidebar__tab"
        :class="{ 'admin-reports-sidebar__tab--selected': tab === option.value }"
        @click="tab = option.value"
      >
        {{ tabLabel(option) }}
      </button>
    </div>

    <div class="admin-reports-sidebar__severity-filter">
      <button
        type="button"
        class="admin-reports-sidebar__severity-option"
        :class="{ 'admin-reports-sidebar__severity-option--selected': severityFilter === '' }"
        @click="severityFilter = ''"
      >
        All
      </button>
      <button
        v-for="option in REPORT_SEVERITY_OPTIONS"
        :key="option.value"
        type="button"
        class="admin-reports-sidebar__severity-option"
        :class="{
          'admin-reports-sidebar__severity-option--selected': severityFilter === option.value
        }"
        :style="{ '--option-color': option.color }"
        @click="severityFilter = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <p v-if="!loading && reports.length === 0" class="admin-reports-sidebar__empty">
      No {{ tab }} reports{{ severityFilter ? ` with ${severityFilter} severity` : '' }}.
    </p>

    <ul v-else class="admin-reports-sidebar__list">
      <li v-for="report in reports" :key="reportId(report)">
        <BaseCard
          class="admin-reports-sidebar__item"
          :class="{ 'admin-reports-sidebar__item--selected': isSelected(report) }"
          @click="onSelect(report)"
        >
          <div class="admin-reports-sidebar__row">
            <span
              class="admin-reports-sidebar__icon"
              v-html="reportTypeOption(report.type)?.icon"
            />
            <div class="admin-reports-sidebar__row-text">
              <span class="admin-reports-sidebar__name">{{
                reportTypeOption(report.type)?.label ?? report.type
              }}</span>
              <span class="admin-reports-sidebar__trail">{{
                report.trail?.name ?? 'Unknown trail'
              }}</span>
            </div>
            <span
              class="admin-reports-sidebar__severity"
              :style="{ '--severity-color': severityOption(report.severity)?.color }"
            >
              {{ severityOption(report.severity)?.label }}
            </span>
          </div>
          <div class="admin-reports-sidebar__meta">
            <span class="admin-reports-sidebar__time">{{ timeAgo(report.createdAt) }}</span>
            <span v-if="report.isSuspicious" class="admin-reports-sidebar__flag">Suspicious</span>
            <span v-else-if="report.markedAsSpam" class="admin-reports-sidebar__flag">Spam</span>
            <span v-if="report.trail?.closureProposed" class="admin-reports-sidebar__flag">
              Closure proposed
            </span>
            <span
              v-if="report.trustScore !== undefined"
              class="admin-reports-sidebar__trust"
              title="Trust score: confirmations from other nearby users and the author's reputation"
            >
              Trust {{ report.trustScore }}
            </span>
          </div>

          <div v-if="isSelected(report)" class="admin-reports-sidebar__details">
            <img
              v-if="report.photoUrl"
              :src="report.photoUrl"
              alt="Report photo"
              class="admin-reports-sidebar__photo"
            />

            <p v-if="report.description" class="admin-reports-sidebar__description">
              &ldquo;{{ report.description }}&rdquo;
            </p>

            <p class="admin-reports-sidebar__author">
              Reported by {{ report.author?.email ?? 'unknown' }}
            </p>

            <p
              v-if="report.trail?.closureProposed"
              class="admin-reports-sidebar__proposal-hint"
              @click.stop
            >
              The system proposed closing this trail and is waiting for your decision.
              <RouterLink :to="{ name: 'admin-trails', query: { trail: report.trail.id } }">
                Review the closure proposal
              </RouterLink>
            </p>
            <p v-if="report.isSuspicious" class="admin-reports-sidebar__suspicious-hint">
              Sent right after another identical report by the same user at the same spot. It stays
              hidden from the public until you review it.
            </p>

            <p
              v-if="tab === 'suspicious'"
              class="admin-reports-sidebar__reputation-notice"
              @click.stop
            >
              <strong>Reject as spam</strong> lowers the author's reputation. Use plain
              <strong>Reject</strong> when the report is just wrong or unhelpful.
            </p>

            <label v-if="canAddNote()" class="admin-reports-sidebar__note-field">
              <span>Note (optional)</span>
              <textarea v-model="noteDraft" rows="2" @click.stop />
            </label>

            <div v-if="isRevisable()" class="admin-reports-sidebar__actions" @click.stop>
              <BaseButton
                v-if="tab === 'validated'"
                variant="secondary"
                :disabled="reviewing"
                @click="review(report, 'rejected')"
              >
                Change to rejected
              </BaseButton>
              <BaseButton v-else :disabled="reviewing" @click="review(report, 'validated')">
                Change to validated
              </BaseButton>
            </div>

            <div v-if="isReviewable()" class="admin-reports-sidebar__actions" @click.stop>
              <BaseButton
                variant="secondary"
                :disabled="reviewing"
                @click="review(report, 'rejected')"
              >
                Reject
              </BaseButton>
              <BaseButton
                v-if="tab === 'suspicious'"
                variant="secondary"
                :disabled="reviewing"
                @click="rejectAsSpam(report)"
              >
                {{ spamConfirmId === reportId(report) ? 'Confirm spam' : 'Reject as spam' }}
              </BaseButton>
              <BaseButton :disabled="reviewing" @click="review(report, 'validated')"
                >Validate</BaseButton
              >
            </div>

            <p v-if="isReviewable()" class="admin-reports-sidebar__legend" @click.stop>
              <strong>Validate</strong> publishes the report. <strong>Reject</strong> hides it, with
              no penalty for the author.
              <template v-if="tab === 'suspicious'">
                <strong>Reject as spam</strong> hides it and lowers the author's reputation (asks
                for confirmation).
              </template>
            </p>
            <p v-else-if="isRevisable()" class="admin-reports-sidebar__legend" @click.stop>
              You can change your decision. Any reputation change from the previous decision is
              reverted.
            </p>

            <p
              v-if="spamConfirmId === reportId(report)"
              class="admin-reports-sidebar__suspicious-hint"
            >
              This lowers the author's reputation. Click "Confirm spam" only if you are sure.
            </p>

            <p
              v-else-if="!isReviewable() && report.validationNote"
              class="admin-reports-sidebar__note-readonly"
            >
              Note: {{ report.validationNote }}
            </p>
          </div>
        </BaseCard>
      </li>
    </ul>

    <slot name="footer" />
  </aside>
</template>

<style scoped>
.admin-reports-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  overflow-y: auto;
}

.admin-reports-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.admin-reports-sidebar__title {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.5rem;
}

.admin-reports-sidebar__pending-stat {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.admin-reports-sidebar__pending-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-status-crowded);
}

.admin-reports-sidebar__tabs {
  display: flex;
  gap: 0.4rem;
}

.admin-reports-sidebar__tab {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.75rem;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.85rem;
  overflow-wrap: break-word;
  cursor: pointer;
}

.admin-reports-sidebar__tab--selected {
  background: var(--color-primary);
  color: white;
}

.admin-reports-sidebar__severity-filter {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.admin-reports-sidebar__severity-option {
  padding: 0.35rem 0.7rem;
  border: 1px solid rgba(26, 62, 47, 0.15);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: 0.8rem;
  cursor: pointer;
}

.admin-reports-sidebar__severity-option--selected {
  border-color: var(--option-color, var(--color-primary));
  background: var(--option-color, var(--color-primary));
  color: white;
}

.admin-reports-sidebar__empty {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.admin-reports-sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.admin-reports-sidebar__item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

.admin-reports-sidebar__item--selected {
  box-shadow: 0 0 0 2px var(--color-primary);
}

.admin-reports-sidebar__row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.admin-reports-sidebar__icon {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--color-primary);
}

.admin-reports-sidebar__icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.admin-reports-sidebar__row-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.admin-reports-sidebar__name {
  font-weight: 600;
  font-size: 0.95rem;
}

.admin-reports-sidebar__trail {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.admin-reports-sidebar__severity {
  flex-shrink: 0;
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--severity-color);
  background-color: color-mix(in srgb, var(--severity-color) 15%, white);
}

.admin-reports-sidebar__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-left: 2.1rem;
}

.admin-reports-sidebar__time {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.admin-reports-sidebar__trust {
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary) 10%, white);
}

.admin-reports-sidebar__details {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.4rem;
}

.admin-reports-sidebar__photo {
  width: 100%;
  height: 160px;
  object-fit: cover;
  border-radius: var(--radius-card);
  background-color: var(--color-background);
}

.admin-reports-sidebar__description {
  margin: 0;
  font-size: 0.9rem;
  font-style: italic;
}

.admin-reports-sidebar__author {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.admin-reports-sidebar__note-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.admin-reports-sidebar__note-field textarea {
  font-family: var(--font-body);
  font-size: 0.85rem;
  padding: 0.5rem;
  border: 1px solid rgba(26, 62, 47, 0.15);
  border-radius: 8px;
  resize: vertical;
}

.admin-reports-sidebar__note-readonly {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.admin-reports-sidebar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.admin-reports-sidebar__flag {
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-status-closed);
  background-color: color-mix(in srgb, var(--color-status-closed) 10%, white);
}

.admin-reports-sidebar__proposal-hint {
  margin: 0;
  padding: 0.5rem 0.65rem;
  border-left: 3px solid var(--color-status-closed);
  border-radius: 6px;
  background-color: color-mix(in srgb, var(--color-status-closed) 8%, white);
  font-size: 0.8rem;
}

.admin-reports-sidebar__proposal-hint a {
  display: block;
  margin-top: 0.25rem;
  font-weight: 600;
  color: var(--color-status-closed);
}

.admin-reports-sidebar__suspicious-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.admin-reports-sidebar__actions > * {
  flex: 1;
}

@media (max-width: 640px) {
  .admin-reports-sidebar__tabs {
    flex-wrap: wrap;
    row-gap: 0.4rem;
  }

  .admin-reports-sidebar__tab {
    flex: 0 1 auto;
    white-space: nowrap;
    padding: 0.5rem 0.65rem;
    font-size: 0.8rem;
  }

  .admin-reports-sidebar__severity-option {
    flex: 0 0 auto;
  }
}

.admin-reports-sidebar__feedback {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md, 8px);
  background: var(--color-surface);
  border-left: 3px solid var(--color-primary);
  font-size: 0.85rem;
}

.admin-reports-sidebar__reputation-notice {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md, 8px);
  background: rgba(214, 140, 30, 0.14);
  border-left: 3px solid var(--color-status-crowded);
  font-size: 0.8rem;
}

.admin-reports-sidebar__legend {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}
</style>
