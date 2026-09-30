<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/api/client.js'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { REPORT_TYPE_OPTIONS } from '@/config/reportOptions.js'
import { REPORT_VALIDATION_STATUSES } from '@/config/reportValidationStatus.js'

const auth = useAuthStore()

const reports = ref([])
const loading = ref(true)
const withdrawingId = ref(null)

function reportTypeOption(type) {
  return REPORT_TYPE_OPTIONS.find((option) => option.value === type)
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

async function loadReports() {
  loading.value = true
  try {
    const { data } = await api.get('/reports/me')
    reports.value = data.reports
  } catch (err) {
    console.error('Failed to load your reports:', err)
  } finally {
    loading.value = false
  }
}

async function withdraw(report) {
  withdrawingId.value = report.id
  try {
    const { data } = await api.patch(`/reports/${report.id}/withdraw`)
    const index = reports.value.findIndex((r) => r.id === report.id)
    if (index !== -1) reports.value[index] = data
  } catch (err) {
    console.error('Failed to withdraw report:', err)
  } finally {
    withdrawingId.value = null
  }
}

onMounted(loadReports)
</script>

<template>
  <main class="profile-page">
    <BaseCard class="profile-page__account">
      <div class="profile-page__header">
        <h1 class="profile-page__title">My profile</h1>
        <RouterLink to="/" class="profile-page__close" title="Back to map">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </RouterLink>
      </div>
      <dl class="profile-page__account-stats">
        <div>
          <dt>Email</dt>
          <dd>{{ auth.user?.email }}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{{ auth.user?.role }}</dd>
        </div>
        <div>
          <dt>Reputation</dt>
          <dd>{{ auth.user?.reputation ?? 0 }}</dd>
        </div>
      </dl>
    </BaseCard>

    <section class="profile-page__reports">
      <h2 class="profile-page__reports-title">My reports</h2>

      <p v-if="loading" class="profile-page__empty">Loading…</p>
      <p v-else-if="reports.length === 0" class="profile-page__empty">
        You haven't submitted any report yet.
      </p>

      <ul v-else class="profile-page__list">
        <li v-for="report in reports" :key="report.id">
          <BaseCard class="profile-page__item">
            <div class="profile-page__item-row">
              <span class="profile-page__item-icon" v-html="reportTypeOption(report.type)?.icon" />
              <div class="profile-page__item-text">
                <span class="profile-page__item-name">{{
                  reportTypeOption(report.type)?.label ?? report.type
                }}</span>
                <span class="profile-page__item-trail">{{
                  report.trail?.name ?? 'Unknown trail'
                }}</span>
              </div>
              <StatusBadge
                :status="report.validationStatus"
                :statuses="REPORT_VALIDATION_STATUSES"
              />
            </div>

            <img
              v-if="report.photoUrl"
              :src="report.photoUrl"
              alt="Report photo"
              class="profile-page__item-photo"
            />

            <p v-if="report.description" class="profile-page__item-description">
              {{ report.description }}
            </p>

            <p
              v-if="report.validationStatus === 'rejected' && report.validationNote"
              class="profile-page__item-note"
            >
              Reason: {{ report.validationNote }}
            </p>

            <div class="profile-page__item-footer">
              <span class="profile-page__item-date">{{ formatDate(report.createdAt) }}</span>
              <BaseButton
                v-if="report.validationStatus === 'pending'"
                variant="secondary"
                :disabled="withdrawingId === report.id"
                @click="withdraw(report)"
              >
                {{ withdrawingId === report.id ? 'Withdrawing…' : 'Withdraw' }}
              </BaseButton>
            </div>
          </BaseCard>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.profile-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.profile-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.profile-page__title {
  margin: 0;
  font-size: 1.4rem;
}

.profile-page__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.profile-page__close:hover {
  background: var(--color-background);
  color: var(--color-primary);
}

.profile-page__close svg {
  width: 20px;
  height: 20px;
}

.profile-page__account-stats {
  display: flex;
  gap: 2rem;
  margin: 0;
}

.profile-page__account-stats dt {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.profile-page__account-stats dd {
  margin: 0.2rem 0 0;
  font-weight: 600;
}

.profile-page__reports-title {
  margin: 0 0 1rem;
  font-size: 1.2rem;
}

.profile-page__empty {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.profile-page__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.profile-page__item {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem;
}

.profile-page__item-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.profile-page__item-icon {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--color-primary);
}

.profile-page__item-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.profile-page__item-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.profile-page__item-name {
  font-weight: 600;
  font-size: 0.95rem;
}

.profile-page__item-trail {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.profile-page__item-photo {
  width: 100%;
  height: 160px;
  object-fit: cover;
  border-radius: var(--radius-card);
  background-color: var(--color-background);
}

.profile-page__item-description {
  margin: 0;
  font-size: 0.9rem;
}

.profile-page__item-note {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.profile-page__item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.profile-page__item-date {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
</style>
