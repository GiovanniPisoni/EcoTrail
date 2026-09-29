<script setup>
import { onMounted, ref } from 'vue'
import TrailsMap from '@/components/TrailsMap.vue'
import AdminReportsLayer from '@/components/AdminReportsLayer.vue'
import AdminReportsSidebar from '@/components/AdminReportsSidebar.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { REPORT_TYPE_OPTIONS } from '@/config/reportOptions.js'
import { REPORT_VALIDATION_STATUSES } from '@/config/reportValidationStatus.js'
import api from '@/api/client.js'

const mapInstance = ref(null)
const visibleReports = ref([])
const selectedId = ref(null)
const pendingCount = ref(null)
const recentActivity = ref([])

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
      params: { validationStatus: 'pending', limit: 1 }
    })
    pendingCount.value = data.pagination.total
  } catch (err) {
    console.error('Failed to load the pending reports count:', err)
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
  loadRecentActivity()
}

onMounted(() => {
  loadPendingCount()
  loadRecentActivity()
})
</script>

<template>
  <main class="admin-page">
    <AdminReportsSidebar
      class="admin-page__sidebar"
      :selected-id="selectedId"
      :pending-count="pendingCount"
      @select="selectedId = $event"
      @reports-loaded="visibleReports = $event"
      @reviewed="onReviewed"
    />

    <div class="admin-page__side">
      <div class="admin-page__map-wrap">
        <TrailsMap class="admin-page__map" @map-ready="mapInstance = $event" />
        <AdminReportsLayer
          v-if="mapInstance"
          :map="mapInstance"
          :reports="visibleReports"
          :selected-id="selectedId"
          @select="selectedId = $event"
        />
      </div>

      <div class="admin-page__activity">
        <h3 class="admin-page__activity-title">Recent activity</h3>
        <p v-if="recentActivity.length === 0" class="admin-page__activity-empty">
          Nothing reviewed yet.
        </p>
        <ul v-else class="admin-page__activity-list">
          <li v-for="report in recentActivity" :key="report.id" class="admin-page__activity-item">
            <StatusBadge :status="report.validationStatus" :statuses="REPORT_VALIDATION_STATUSES" />
            <span class="admin-page__activity-text">
              {{ reportTypeLabel(report.type) }} on {{ report.trail?.name ?? 'Unknown trail' }}
            </span>
            <span class="admin-page__activity-time">{{ timeAgo(report.validatedAt) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </main>
</template>

<style scoped>
.admin-page {
  display: flex;
  height: calc(100vh - 65px);
}

.admin-page__sidebar {
  width: 420px;
  flex-shrink: 0;
  border-right: 1px solid rgba(26, 62, 47, 0.1);
  background-color: var(--color-background);
}

.admin-page__side {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.admin-page__map-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
}

.admin-page__map {
  width: 100%;
  height: 100%;
}

.admin-page__activity {
  flex-shrink: 0;
  max-height: 220px;
  overflow-y: auto;
  padding: 1rem;
  border-top: 1px solid rgba(26, 62, 47, 0.1);
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
  .admin-page {
    flex-direction: column;
    height: auto;
    min-height: calc(100vh - 65px);
  }

  .admin-page__sidebar {
    width: 100%;
    max-height: none;
    border-right: none;
    order: 1;
  }

  .admin-page__side {
    order: 2;
  }

  .admin-page__map-wrap {
    min-height: 50vh;
  }
}
</style>
