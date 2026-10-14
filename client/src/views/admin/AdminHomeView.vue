<script setup>
import { computed, onMounted, ref, shallowRef } from 'vue'
import TrailsMap from '@/components/trails/TrailsMap.vue'
import MapSearch from '@/components/trails/MapSearch.vue'
import AdminReportsLayer from '@/components/admin/AdminReportsLayer.vue'
import AdminReportsSidebar from '@/components/admin/AdminReportsSidebar.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { REPORT_TYPE_OPTIONS } from '@/config/reportOptions.js'
import { REPORT_VALIDATION_STATUSES } from '@/config/reportValidationStatus.js'
import api from '@/api/client.js'

const mapInstance = shallowRef(null)
const mobileMapVisible = ref(false)
const visibleReports = ref([])
const visibleTrails = ref([])
const selectedId = ref(null)
const pendingCount = ref(null)
const criticalCount = ref(null)
const verifiedTodayCount = ref(null)
const recentActivity = ref([])

const activeTrailsCount = computed(
  () => visibleTrails.value.filter((trail) => trail.properties.status !== 'closed').length
)

function reportTypeLabel(type) {
  return REPORT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
}

function timeAgo(isoDate) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(isoDate).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

async function loadPendingCount() {
  try {
    const { data } = await api.get('/reports/admin', {
      params: { validationStatus: 'pending', suspicious: false, limit: 1 }
    })
    pendingCount.value = data.pagination.total
  } catch (err) {
    console.error('Failed to load the pending reports count:', err)
  }
}

async function loadCriticalCount() {
  try {
    const { data } = await api.get('/reports/admin', {
      params: { validationStatus: 'pending', suspicious: false, severity: 'high', limit: 1 }
    })
    criticalCount.value = data.pagination.total
  } catch (err) {
    console.error('Failed to load the critical reports count:', err)
  }
}

async function loadVerifiedTodayCount() {
  try {
    const { data } = await api.get('/reports/admin', {
      params: { validationStatus: 'validated', limit: 100 }
    })
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    verifiedTodayCount.value = data.reports.filter(
      (report) => report.validatedAt && new Date(report.validatedAt) >= startOfToday
    ).length
  } catch (err) {
    console.error("Failed to load today's verified count:", err)
  }
}

async function loadRecentActivity() {
  try {
    const [validated, rejected] = await Promise.all([
      api.get('/reports/admin', { params: { validationStatus: 'validated', limit: 20 } }),
      api.get('/reports/admin', { params: { validationStatus: 'rejected', limit: 20 } })
    ])

    recentActivity.value = [...validated.data.reports, ...rejected.data.reports]
      .filter((report) => report.validatedAt)
      .sort((a, b) => new Date(b.validatedAt) - new Date(a.validatedAt))
      .slice(0, 5)
  } catch (err) {
    console.error('Failed to load recent activity:', err)
  }
}

function onReviewed() {
  loadPendingCount()
  loadCriticalCount()
  loadVerifiedTodayCount()
  loadRecentActivity()
}

onMounted(() => {
  loadPendingCount()
  loadCriticalCount()
  loadVerifiedTodayCount()
  loadRecentActivity()
})
</script>

<template>
  <main class="admin-page">
    <div class="admin-page__stats">
      <div class="admin-page__stat-card">
        <span class="admin-page__stat-label">Pending verification</span>
        <span class="admin-page__stat-value admin-page__stat-value--pending">
          <span class="admin-page__stat-dot" />{{ pendingCount ?? '-' }}
        </span>
      </div>
      <div class="admin-page__stat-card">
        <span class="admin-page__stat-label">Critical warnings</span>
        <span class="admin-page__stat-value admin-page__stat-value--critical">
          <span class="admin-page__stat-dot" />{{ criticalCount ?? '-' }}
        </span>
      </div>
      <div class="admin-page__stat-card">
        <span class="admin-page__stat-label">Verified today</span>
        <span class="admin-page__stat-value admin-page__stat-value--verified">
          <span class="admin-page__stat-dot" />{{ verifiedTodayCount ?? '-' }}
        </span>
      </div>
      <div class="admin-page__stat-card">
        <span class="admin-page__stat-label">Active trails</span>
        <span class="admin-page__stat-value admin-page__stat-value--active">
          <span class="admin-page__stat-dot" />{{ activeTrailsCount }}
        </span>
      </div>
    </div>

    <div class="admin-page__body">
      <AdminReportsSidebar
        class="admin-page__sidebar"
        :selected-id="selectedId"
        :pending-count="pendingCount"
        @select="selectedId = $event"
        @reports-loaded="visibleReports = $event"
        @reviewed="onReviewed"
      >
        <template #footer>
          <div class="admin-page__activity admin-page__activity--mobile">
            <h3 class="admin-page__activity-title">Recent activity</h3>
            <p v-if="recentActivity.length === 0" class="admin-page__activity-empty">
              Nothing reviewed yet.
            </p>
            <ul v-else class="admin-page__activity-list">
              <li
                v-for="report in recentActivity"
                :key="report.id"
                class="admin-page__activity-item"
              >
                <StatusBadge
                  :status="report.validationStatus"
                  :statuses="REPORT_VALIDATION_STATUSES"
                />
                <span class="admin-page__activity-text">
                  {{ reportTypeLabel(report.type) }} on {{ report.trail?.name ?? 'Unknown trail' }}
                </span>
                <span class="admin-page__activity-time">{{ timeAgo(report.validatedAt) }}</span>
              </li>
            </ul>
          </div>
        </template>
      </AdminReportsSidebar>

      <div class="admin-page__side">
        <BaseButton
          type="button"
          class="admin-page__view-map-btn"
          @click="mobileMapVisible = !mobileMapVisible"
        >
          <svg
            v-if="!mobileMapVisible"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M1 6v15l7-3 8 3 7-3V3l-7 3-8-3-7 3Z" />
            <path d="M8 3v15" />
            <path d="M16 6v15" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
          {{ mobileMapVisible ? 'Hide active map' : 'View active map' }}
        </BaseButton>

        <div
          class="admin-page__map-card"
          :class="{ 'admin-page__map-card--mobile-hidden': !mobileMapVisible }"
        >
          <h3 class="admin-page__map-title">Park district live hazard map</h3>
          <div class="admin-page__map-wrap">
            <TrailsMap
              class="admin-page__map"
              @map-ready="mapInstance = $event"
              @trails-loaded="visibleTrails = $event"
            />
            <MapSearch v-if="mapInstance" :map="mapInstance" />
            <AdminReportsLayer
              v-if="mapInstance"
              :map="mapInstance"
              :reports="visibleReports"
              :selected-id="selectedId"
              @select="selectedId = $event"
            />
          </div>
        </div>

        <div class="admin-page__activity admin-page__activity--desktop">
          <h3 class="admin-page__activity-title">Recent activity</h3>
          <p v-if="recentActivity.length === 0" class="admin-page__activity-empty">
            Nothing reviewed yet.
          </p>
          <ul v-else class="admin-page__activity-list">
            <li v-for="report in recentActivity" :key="report.id" class="admin-page__activity-item">
              <StatusBadge
                :status="report.validationStatus"
                :statuses="REPORT_VALIDATION_STATUSES"
              />
              <span class="admin-page__activity-text">
                {{ reportTypeLabel(report.type) }} on {{ report.trail?.name ?? 'Unknown trail' }}
              </span>
              <span class="admin-page__activity-time">{{ timeAgo(report.validatedAt) }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 65px);
}

.admin-page__stats {
  flex-shrink: 0;
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  flex-wrap: wrap;
}

.admin-page__stat-card {
  flex: 1;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-card);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
  background-color: var(--color-surface);
}

.admin-page__stat-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.admin-page__stat-value {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-heading);
  font-size: 1.4rem;
}

.admin-page__stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.admin-page__stat-value--pending .admin-page__stat-dot {
  background-color: #f59e0b;
}

.admin-page__stat-value--critical .admin-page__stat-dot {
  background-color: #ef4444;
}

.admin-page__stat-value--verified .admin-page__stat-dot {
  background-color: #10b981;
}

.admin-page__stat-value--active .admin-page__stat-dot {
  background-color: var(--color-primary);
}

.admin-page__body {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 0 1rem 1rem;
  gap: 1rem;
}

.admin-page__sidebar {
  flex: 1 1 calc(70% - 0.5rem);
  max-width: calc(70% - 0.5rem);
  min-width: 0;
  border-radius: var(--radius-card);
  background-color: var(--color-background);
}

.admin-page__side {
  flex: 1 1 calc(30% - 0.5rem);
  max-width: calc(30% - 0.5rem);
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  gap: 1rem;
}

.admin-page__map-card {
  flex-shrink: 0;
  overflow: hidden;
  border-radius: var(--radius-card);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
  background-color: var(--color-surface);
}

.admin-page__activity--mobile {
  display: none;
}

.admin-page__view-map-btn {
  display: none;
}

.admin-page__view-map-btn svg {
  width: 18px;
  height: 18px;
  margin-right: 0.5rem;
}

.admin-page__map-title {
  position: relative;
  z-index: 10;
  margin: 0;
  padding: 0.75rem 1rem 0.5rem;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.1rem;
  background-color: var(--color-surface);
}

.admin-page__map-wrap {
  position: relative;
  height: 260px;
  overflow: hidden;
}

.admin-page__map-wrap .admin-page__map {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.admin-page__activity {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
  border-radius: var(--radius-card);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
  background-color: var(--color-surface);
}

.admin-page__activity-title {
  margin: 0 0 0.6rem;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.1rem;
}

.admin-page__activity-empty {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.admin-page__activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.admin-page__activity-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
}

.admin-page__activity-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-page__activity-time {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

@media (max-width: 640px) {
  .admin-page__stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 0.75rem;
  }

  .admin-page__stat-card {
    min-width: 0;
    padding: 0.6rem 0.75rem;
  }

  .admin-page__stat-value {
    font-size: 1.15rem;
  }

  .admin-page__body {
    flex-direction: column;
    height: auto;
    min-height: 0;
    padding: 0 0.75rem 0.75rem;
  }

  .admin-page__sidebar {
    flex: none;
    width: 100%;
    max-width: 100%;
    max-height: none;
    order: 1;
  }

  .admin-page__side {
    flex: none;
    width: 100%;
    max-width: 100%;
    overflow-y: visible;
    order: 0;
  }

  .admin-page__activity--mobile {
    display: block;
  }

  .admin-page__activity--desktop {
    display: none;
  }

  .admin-page__view-map-btn {
    display: flex;
    position: fixed;
    bottom: calc(64px + 0.6rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    width: auto;
    margin-top: 0;
    box-shadow: 0 4px 12px rgba(26, 62, 47, 0.3);
  }

  .admin-page__map-card--mobile-hidden {
    display: none;
  }

  .admin-page__map-wrap :deep(.trail-legend) {
    padding: 4px 6px;
    font-size: 0.7rem;
  }

  .admin-page__map-wrap :deep(.trail-legend-item) {
    gap: 4px;
  }
}
</style>
