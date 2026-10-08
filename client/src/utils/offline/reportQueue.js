import { openDB } from 'idb'

export const DEFAULT_RETRY_AFTER_SECONDS = 60

const DB_VERSION = 1
const STORE = 'reports'

export function classifyFailure(error) {
  const response = error?.response
  if (!response) return { kind: 'network' }

  const { status } = response
  if (status === 429) {
    const seconds = Number(response.data?.retryAfterSeconds ?? response.headers?.['retry-after'])
    return {
      kind: 'rate-limited',
      retryAfterSeconds: seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS
    }
  }
  if (status === 401 || status === 403) return { kind: 'auth' }
  if (status === 408 || status >= 500) return { kind: 'server' }

  const details = Object.values(response.data?.details ?? {})
  const message =
    details.length > 0
      ? details.join('. ')
      : (response.data?.error ?? 'The server refused the report')
  return { kind: 'rejected', message }
}

export function createReportQueue({
  dbName = 'ecotrail-offline',
  send,
  now = () => Date.now(),
  newId = () => crypto.randomUUID()
}) {
  let dbPromise = null
  let flushing = null

  function db() {
    dbPromise ??= openDB(dbName, DB_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('userId', 'userId')
      }
    })
    return dbPromise
  }

  async function enqueue(userId, report, { id = newId() } = {}) {
    const record = {
      id,
      userId,
      type: report.type,
      severity: report.severity,
      description: report.description ?? '',
      latitude: report.latitude,
      longitude: report.longitude,
      photo: report.photo ?? null,
      capturedAt: report.capturedAt ?? new Date(now()).toISOString(),
      status: 'waiting',
      attempts: 0,
      error: null,
      retryAt: 0
    }
    await (await db()).put(STORE, record)
    return record
  }

  async function list(userId) {
    const records = await (await db()).getAllFromIndex(STORE, 'userId', userId)
    return records.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
  }

  async function update(id, changes) {
    const database = await db()
    const record = await database.get(STORE, id)
    if (!record) return null
    const updated = { ...record, ...changes }
    await database.put(STORE, updated)
    return updated
  }

  async function remove(id) {
    await (await db()).delete(STORE, id)
  }

  async function retry(id) {
    return update(id, { status: 'waiting', error: null, retryAt: 0 })
  }

  async function run(userId) {
    const result = { sent: 0, rejected: 0 }

    for (const record of await list(userId)) {
      if (record.status !== 'waiting' || record.retryAt > now()) continue

      try {
        await send(record)
        await remove(record.id)
        result.sent += 1
      } catch (error) {
        const failure = classifyFailure(error)

        if (failure.kind === 'rejected') {
          await update(record.id, { status: 'failed', error: failure.message })
          result.rejected += 1
          continue
        }

        const retryAt =
          failure.kind === 'rate-limited' ? now() + failure.retryAfterSeconds * 1000 : 0
        await update(record.id, { attempts: record.attempts + 1, retryAt })
        result.stoppedBy = failure.kind
        break
      }
    }

    return result
  }

  function flush(userId) {
    flushing ??= run(userId).finally(() => {
      flushing = null
    })
    return flushing
  }

  return { enqueue, list, remove, retry, flush }
}
