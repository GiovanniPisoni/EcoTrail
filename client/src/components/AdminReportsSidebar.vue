<script setup>
import { onMounted, ref, watch } from 'vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { REPORT_TYPE_OPTIONS, REPORT_SEVERITY_OPTIONS } from '@/config/reportOptions.js'
import api from '@/api/client.js'

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
  { value: 'pending', label: 'Review Queue' },
  { value: 'validated', label: 'Verified Logs' },
  { value: 'rejected', label: 'Flagged/Archived' }
]

const tab = ref('pending')
const severityFilter = ref('')
const reports = ref([])
const loading = ref(false)
const noteDraft = ref('')
const reviewing = ref(false)

function tabLabel(option) {
  if (option.value === 'pending' && props.pendingCount !== null) {
    return `${option.label} (${props.pendingCount})`
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

async function loadReports() {
  loading.value = true
  try {
    const { data } = await api.get('/reports/admin', {
      params: {
        validationStatus: tab.value,
        severity: severityFilter.value || undefined,
        limit: 100
      }
    })
    reports.value = data.reports
    emit('reports-loaded', data.reports)
  } catch (err) {
    console.error('Failed to load reports:', err)
  } finally {
    loading.value = false
  }
}

function onSelect(report) {
  const id = isSelected(report) ? null : reportId(report)
  noteDraft.value = ''
  emit('select', id)
}

async function review(report, status) {
  reviewing.value = true
  try {
    await api.patch(`/reports/${reportId(report)}/validate`, {
      status,
      note: noteDraft.value.trim() || undefined
    })
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

onMounted(loadReports)
</script>

<template>
  <aside class="admin-reports-sidebar">
    <div class="admin-reports-sidebar__header">
      <h2 class="admin-reports-sidebar__title">Reports</h2>
      <div v-if="pendingCount !== null" class="admin-reports-sidebar__pending-stat">
        <span class="admin-reports-sidebar__pending-dot" />
        <span>{{ pendingCount }} pending</span>
      </div>
    </div>

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
            <span class="admin-reports-sidebar__icon" v-html="reportTypeOption(report.type)?.icon" />
            <div class="admin-reports-sidebar__row-text">
              <span class="admin-reports-sidebar__name">{{ reportTypeOption(report.type)?.label ?? report.type }}</span>
              <span class="admin-reports-sidebar__trail">{{ report.trail?.name ?? 'Unknown trail' }}</span>
            </div>
            <span
              class="admin-reports-sidebar__severity"
              :style="{ '--severity-color': severityOption(report.severity)?.color }"
            >
              {{ severityOption(report.severity)?.label }}
            </span>
          </div>
          <span class="admin-reports-sidebar__time">{{ timeAgo(report.createdAt) }}</span>

          <div v-if="isSelected(report)" class="admin-reports-sidebar__details">
            <img
              v-if="report.photoUrl"
              :src="report.photoUrl"
              alt="Report photo"
              class="admin-reports-sidebar__photo"
            />

            <p v-if="report.description" class="admin-reports-sidebar__description">
              {{ report.description }}
            </p>

            <p class="admin-reports-sidebar__author">Reported by {{ report.author?.email ?? 'unknown' }}</p>

            <label v-if="tab === 'pending'" class="admin-reports-sidebar__note-field">
              <span>Note (optional)</span>
              <textarea v-model="noteDraft" rows="2" @click.stop />
            </label>

            <div v-if="tab === 'pending'" class="admin-reports-sidebar__actions" @click.stop>
              <BaseButton variant="secondary" :disabled="reviewing" @click="review(report, 'rejected')">
                Reject
              </BaseButton>
              <BaseButton :disabled="reviewing" @click="review(report, 'validated')">Validate</BaseButton>
            </div>

            <p v-else-if="report.validationNote" class="admin-reports-sidebar__note-readonly">
              Note: {{ report.validationNote }}
            </p>
          </div>
        </BaseCard>
      </li>
    </ul>
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
  font-size: 1.3rem;
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
  padding: 0.5rem 0.75rem;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.85rem;
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

.admin-reports-sidebar__time {
  padding-left: 2.1rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
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
  gap: 0.6rem;
}

.admin-reports-sidebar__actions > * {
  flex: 1;
}
</style>
