import { computed, ref } from 'vue'
import api from '@/api/client.js'
import { useAuthStore } from '@/stores/auth'
import { createReportQueue } from '@/utils/reportQueue.js'

const RETRY_INTERVAL_MS = 30 * 1000
const LOCK_NAME = 'ecotrail-report-queue'

export const queuedReports = ref([])
export const waitingCount = computed(
  () => queuedReports.value.filter((report) => report.status === 'waiting').length
)
export const sentCounter = ref(0)

function toFormData(record) {
  const formData = new FormData()
  formData.append('type', record.type)
  formData.append('severity', record.severity)
  formData.append('latitude', String(record.latitude))
  formData.append('longitude', String(record.longitude))
  formData.append('capturedAt', record.capturedAt)
  if (record.description) formData.append('description', record.description)
  if (record.photo) formData.append('photo', record.photo, 'photo.jpg')
  return formData
}

function sendRecord(record) {
  return api.post('/reports', toFormData(record), { headers: { 'Idempotency-Key': record.id } })
}

const queue = createReportQueue({ send: sendRecord })

function currentUserId() {
  return useAuthStore().user?.id ?? null
}

async function refreshQueued() {
  const userId = currentUserId()
  queuedReports.value = userId ? await queue.list(userId) : []
}

async function withLock(task) {
  if (!navigator.locks) return task()
  return navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => (lock ? task() : null))
}

export async function flushQueuedReports() {
  const userId = currentUserId()
  if (!userId || navigator.onLine === false) return

  try {
    const result = await withLock(() => queue.flush(userId))
    if (result?.sent > 0) sentCounter.value += result.sent
  } catch (err) {
    console.error('Failed to send the queued reports:', err)
  } finally {
    await refreshQueued()
  }
}

export async function submitReport(fields, photo) {
  const id = crypto.randomUUID()
  const report = { ...fields, photo, capturedAt: new Date().toISOString() }
  const userId = currentUserId()

  async function keepForLater() {
    await queue.enqueue(userId, report, { id })
    await refreshQueued()
    return { queued: true }
  }

  if (navigator.onLine === false) return keepForLater()

  try {
    await sendRecord({ id, ...report })
    return { queued: false }
  } catch (err) {
    if (err.response) throw err
    return keepForLater()
  }
}

export async function discardQueuedReport(id) {
  await queue.remove(id)
  await refreshQueued()
}

export async function retryQueuedReport(id) {
  await queue.retry(id)
  await refreshQueued()
  await flushQueuedReports()
}

export function startOfflineReports() {
  const flushWhenVisible = () => {
    if (document.visibilityState === 'visible') flushQueuedReports()
  }

  refreshQueued().then(flushQueuedReports)
  window.addEventListener('online', flushQueuedReports)
  document.addEventListener('visibilitychange', flushWhenVisible)
  const timer = setInterval(() => {
    if (waitingCount.value > 0) flushQueuedReports()
  }, RETRY_INTERVAL_MS)

  return () => {
    window.removeEventListener('online', flushQueuedReports)
    document.removeEventListener('visibilitychange', flushWhenVisible)
    clearInterval(timer)
  }
}
