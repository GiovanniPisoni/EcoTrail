import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  classifyFailure,
  createReportQueue
} from '@/utils/offline/reportQueue.js'

let dbCounter = 0
let clock
let send
let queue

function httpError(status, data = {}, headers = {}) {
  return { response: { status, data, headers } }
}

function report(overrides = {}) {
  return {
    type: 'fallen_tree',
    severity: 'high',
    description: '',
    latitude: 46.18,
    longitude: 10.9,
    ...overrides
  }
}

beforeEach(() => {
  dbCounter += 1
  clock = 1_000_000
  send = vi.fn().mockResolvedValue({})
  queue = createReportQueue({
    dbName: `test-db-${dbCounter}`,
    send,
    now: () => clock,
    newId: (() => {
      let n = 0
      return () => `id-${++n}`
    })()
  })
})

describe('classifyFailure', () => {
  it('treats a failure with no response as a network problem', () => {
    expect(classifyFailure(new Error('Network Error'))).toEqual({ kind: 'network' })
  })

  it.each([500, 502, 503, 408])('treats %i as a server problem to retry', (status) => {
    expect(classifyFailure(httpError(status)).kind).toBe('server')
  })

  it.each([401, 403])('treats %i as a login problem', (status) => {
    expect(classifyFailure(httpError(status)).kind).toBe('auth')
  })

  it.each([400, 413, 422])('treats %i as a refusal that will not change', (status) => {
    expect(classifyFailure(httpError(status, { error: 'Nope' }))).toEqual({
      kind: 'rejected',
      message: 'Nope'
    })
  })

  it('shows what was wrong when the server explains it', () => {
    const error = httpError(400, {
      error: 'Invalid report data',
      details: { photo: 'The file could not be read as an image', type: 'type is not valid' }
    })

    expect(classifyFailure(error).message).toBe(
      'The file could not be read as an image. type is not valid'
    )
  })

  it('uses the wait time sent with a 429', () => {
    expect(classifyFailure(httpError(429, { retryAfterSeconds: 42 }))).toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 42
    })
  })

  it('falls back to the Retry-After header, then to a default', () => {
    expect(classifyFailure(httpError(429, {}, { 'retry-after': '30' })).retryAfterSeconds).toBe(30)
    expect(classifyFailure(httpError(429)).retryAfterSeconds).toBe(DEFAULT_RETRY_AFTER_SECONDS)
  })
})

describe('storing reports', () => {
  it('keeps a report with its photo until it is sent', async () => {
    const photo = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })

    const saved = await queue.enqueue('user-1', report({ photo }))

    const [stored] = await queue.list('user-1')
    expect(stored.id).toBe(saved.id)
    expect(stored.status).toBe('waiting')
    expect(stored.photo.size).toBe(photo.size)
    expect(stored.photo.type).toBe('image/jpeg')
  })

  it('remembers when the report was written', async () => {
    const saved = await queue.enqueue('user-1', report())

    expect(saved.capturedAt).toBe(new Date(clock).toISOString())
  })

  it('keeps a capture time that was given', async () => {
    const saved = await queue.enqueue('user-1', report({ capturedAt: '2026-10-06T10:00:00.000Z' }))

    expect(saved.capturedAt).toBe('2026-10-06T10:00:00.000Z')
  })

  it('lists only the reports of that user, oldest first', async () => {
    await queue.enqueue('user-1', report({ capturedAt: '2026-10-06T12:00:00.000Z' }))
    await queue.enqueue('user-2', report())
    await queue.enqueue('user-1', report({ capturedAt: '2026-10-06T09:00:00.000Z' }))

    const mine = await queue.list('user-1')

    expect(mine.map((r) => r.capturedAt)).toEqual([
      '2026-10-06T09:00:00.000Z',
      '2026-10-06T12:00:00.000Z'
    ])
  })

  it('uses the id given, so that a retry is recognised by the server', async () => {
    const saved = await queue.enqueue('user-1', report(), { id: 'same-id' })

    expect(saved.id).toBe('same-id')
  })
})

describe('sending the queue', () => {
  it('sends every report in order and empties the queue', async () => {
    await queue.enqueue('user-1', report({ capturedAt: '2026-10-06T10:00:00.000Z' }))
    await queue.enqueue('user-1', report({ capturedAt: '2026-10-06T09:00:00.000Z' }))

    const result = await queue.flush('user-1')

    expect(result.sent).toBe(2)
    expect(send.mock.calls.map(([r]) => r.capturedAt)).toEqual([
      '2026-10-06T09:00:00.000Z',
      '2026-10-06T10:00:00.000Z'
    ])
    expect(await queue.list('user-1')).toEqual([])
  })

  it('does not send the reports of another user', async () => {
    await queue.enqueue('user-2', report())

    const result = await queue.flush('user-1')

    expect(result.sent).toBe(0)
    expect(send).not.toHaveBeenCalled()
    expect(await queue.list('user-2')).toHaveLength(1)
  })

  it('keeps the report and stops when the network is down', async () => {
    await queue.enqueue('user-1', report())
    await queue.enqueue('user-1', report({ capturedAt: '2999-01-01T00:00:00.000Z' }))
    send.mockRejectedValue(new Error('Network Error'))

    const result = await queue.flush('user-1')

    expect(result).toMatchObject({ sent: 0, stoppedBy: 'network' })
    expect(send).toHaveBeenCalledTimes(1)
    const kept = await queue.list('user-1')
    expect(kept).toHaveLength(2)
    expect(kept[0].attempts).toBe(1)
  })

  it('keeps a report when the server fails, and sends it on the next try', async () => {
    await queue.enqueue('user-1', report())
    send.mockRejectedValueOnce(httpError(503))

    expect((await queue.flush('user-1')).stoppedBy).toBe('server')
    const second = await queue.flush('user-1')

    expect(second.sent).toBe(1)
    expect(await queue.list('user-1')).toEqual([])
  })

  it('waits for login when the session has expired', async () => {
    await queue.enqueue('user-1', report())
    send.mockRejectedValue(httpError(401))

    const result = await queue.flush('user-1')

    expect(result.stoppedBy).toBe('auth')
    expect(await queue.list('user-1')).toHaveLength(1)
  })

  it('marks a refused report as failed, with the reason, and goes on with the others', async () => {
    await queue.enqueue('user-1', report({ capturedAt: '2026-10-06T09:00:00.000Z' }))
    await queue.enqueue('user-1', report({ capturedAt: '2026-10-06T10:00:00.000Z' }))
    send.mockRejectedValueOnce(httpError(422, { error: 'No trail within 200 m' }))

    const result = await queue.flush('user-1')

    expect(result).toMatchObject({ sent: 1, rejected: 1 })
    const [failed] = await queue.list('user-1')
    expect(failed.status).toBe('failed')
    expect(failed.error).toBe('No trail within 200 m')
  })

  it('does not send a failed report again until the user retries', async () => {
    await queue.enqueue('user-1', report())
    send.mockRejectedValueOnce(httpError(422, { error: 'No trail within 200 m' }))
    await queue.flush('user-1')

    await queue.flush('user-1')
    expect(send).toHaveBeenCalledTimes(1)

    const [failed] = await queue.list('user-1')
    await queue.retry(failed.id)
    const result = await queue.flush('user-1')

    expect(result.sent).toBe(1)
  })

  it('waits as long as the server asks after a 429', async () => {
    await queue.enqueue('user-1', report())
    send.mockRejectedValueOnce(httpError(429, { retryAfterSeconds: 120 }))

    expect((await queue.flush('user-1')).stoppedBy).toBe('rate-limited')

    clock += 60 * 1000
    await queue.flush('user-1')
    expect(send).toHaveBeenCalledTimes(1)

    clock += 61 * 1000
    const result = await queue.flush('user-1')
    expect(result.sent).toBe(1)
  })

  it('runs only one send at a time, even when asked twice', async () => {
    await queue.enqueue('user-1', report())
    let release
    send.mockImplementation(() => new Promise((resolve) => (release = resolve)))

    const first = queue.flush('user-1')
    const second = queue.flush('user-1')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    release({})
    await Promise.all([first, second])

    expect(send).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })

  it('discards a report the user does not want to send', async () => {
    const saved = await queue.enqueue('user-1', report())

    await queue.remove(saved.id)

    expect(await queue.list('user-1')).toEqual([])
  })

  it('sends the same id on every attempt, so the server can drop duplicates', async () => {
    await queue.enqueue('user-1', report())
    send.mockRejectedValueOnce(new Error('Network Error'))

    await queue.flush('user-1')
    await queue.flush('user-1')

    const ids = send.mock.calls.map(([r]) => r.id)
    expect(new Set(ids).size).toBe(1)
  })
})
