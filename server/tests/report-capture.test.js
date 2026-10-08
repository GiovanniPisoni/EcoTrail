import { describe, it, expect } from 'vitest'
import {
  MAX_CAPTURE_AGE_MS,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  clampCapturedAt,
  parseCapturedAt,
  readIdempotencyKey
} from '../src/services/reportCapture.js'
import { validateReportInput } from '../src/services/validateReportInput.js'

const NOW = new Date('2026-10-06T12:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000

describe('parseCapturedAt', () => {
  it.each([undefined, null, ''])('treats %j as not provided', (raw) => {
    expect(parseCapturedAt(raw)).toEqual({ value: undefined })
  })

  it('reads an ISO date', () => {
    const { value } = parseCapturedAt('2026-10-06T10:00:00.000Z')

    expect(value).toEqual(new Date('2026-10-06T10:00:00.000Z'))
  })

  it.each(['yesterday', '2026-13-45', 12345, {}])('rejects %j', (raw) => {
    expect(parseCapturedAt(raw).error).toBeDefined()
  })
})

describe('clampCapturedAt', () => {
  it('keeps a time inside the allowed range', () => {
    const captured = new Date(NOW.getTime() - 2 * HOUR_MS)

    expect(clampCapturedAt(captured, NOW)).toEqual(captured)
  })

  it('never goes into the future', () => {
    const future = new Date(NOW.getTime() + HOUR_MS)

    expect(clampCapturedAt(future, NOW)).toEqual(NOW)
  })

  it('never goes back more than 24 hours', () => {
    const tooOld = new Date(NOW.getTime() - 3 * MAX_CAPTURE_AGE_MS)

    expect(clampCapturedAt(tooOld, NOW)).toEqual(new Date(NOW.getTime() - MAX_CAPTURE_AGE_MS))
  })

  it('accepts exactly the limits', () => {
    const oldest = new Date(NOW.getTime() - MAX_CAPTURE_AGE_MS)

    expect(clampCapturedAt(oldest, NOW)).toEqual(oldest)
    expect(clampCapturedAt(NOW, NOW)).toEqual(NOW)
  })
})

describe('readIdempotencyKey', () => {
  it.each([undefined, ''])('treats %j as no key', (header) => {
    expect(readIdempotencyKey(header)).toEqual({ key: undefined })
  })

  it('accepts a UUID', () => {
    const key = '3f2b8c1e-5a47-4d0e-9c1a-7b6e2d9f0a11'

    expect(readIdempotencyKey(key)).toEqual({ key })
  })

  it.each(['has spaces', 'with/slash', 'a'.repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1)])(
    'rejects %j',
    (header) => {
      expect(readIdempotencyKey(header).error).toBeDefined()
    }
  )
})

describe('validateReportInput and capturedAt', () => {
  const valid = { type: 'fallen_tree', severity: 'high', latitude: 46.18, longitude: 10.9 }

  it('passes a valid capturedAt on', () => {
    const { value } = validateReportInput({ ...valid, capturedAt: '2026-10-06T10:00:00.000Z' })

    expect(value.capturedAt).toEqual(new Date('2026-10-06T10:00:00.000Z'))
  })

  it('leaves capturedAt undefined when it is not sent', () => {
    expect(validateReportInput(valid).value.capturedAt).toBeUndefined()
  })

  it('reports an invalid capturedAt with the other errors', () => {
    const { errors } = validateReportInput({ ...valid, type: 'nope', capturedAt: 'yesterday' })

    expect(errors.capturedAt).toBeDefined()
    expect(errors.type).toBeDefined()
  })
})
