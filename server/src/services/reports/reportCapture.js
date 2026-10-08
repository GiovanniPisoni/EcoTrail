export const MAX_CAPTURE_AGE_MS = 24 * 60 * 60 * 1000
export const MAX_IDEMPOTENCY_KEY_LENGTH = 64

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]+$/

export function parseCapturedAt(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: undefined }

  const date = typeof raw === 'string' ? new Date(raw) : null
  if (!date || Number.isNaN(date.getTime())) {
    return { error: 'capturedAt must be a valid ISO date' }
  }
  return { value: date }
}

export function clampCapturedAt(capturedAt, now = new Date()) {
  const oldest = new Date(now.getTime() - MAX_CAPTURE_AGE_MS)
  if (capturedAt > now) return now
  if (capturedAt < oldest) return oldest
  return capturedAt
}

export function readIdempotencyKey(header) {
  if (header === undefined || header === '') return { key: undefined }

  if (header.length > MAX_IDEMPOTENCY_KEY_LENGTH || !IDEMPOTENCY_KEY_PATTERN.test(header)) {
    return {
      error: `Idempotency-Key must be up to ${MAX_IDEMPOTENCY_KEY_LENGTH} letters, digits, "-" or "_"`
    }
  }
  return { key: header }
}
