import { REPORT_SEVERITIES, REPORT_TYPES } from '../models/Report.js'
import { parseCapturedAt } from './reportCapture.js'

export const MAX_DESCRIPTION_LENGTH = 1000

export function parseCoordinate(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string' && raw.trim() !== '') {
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  }
  return null
}

export function validateReportInput(body) {
  const input = body ?? {}
  const errors = {}

  if (!REPORT_TYPES.includes(input.type)) {
    errors.type = `type must be one of: ${REPORT_TYPES.join(', ')}`
  }

  if (!REPORT_SEVERITIES.includes(input.severity)) {
    errors.severity = `severity must be one of: ${REPORT_SEVERITIES.join(', ')}`
  }

  const latitude = parseCoordinate(input.latitude)
  if (latitude === null || latitude < -90 || latitude > 90) {
    errors.latitude = 'latitude must be a number between -90 and 90'
  }

  const longitude = parseCoordinate(input.longitude)
  if (longitude === null || longitude < -180 || longitude > 180) {
    errors.longitude = 'longitude must be a number between -180 and 180'
  }

  let description
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string') {
      errors.description = 'description must be a string'
    } else {
      description = input.description.trim() || undefined
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        errors.description = `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`
      }
    }
  }

  const captured = parseCapturedAt(input.capturedAt)
  if (captured.error) {
    errors.capturedAt = captured.error
  }

  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  return {
    value: {
      type: input.type,
      severity: input.severity,
      description,
      latitude,
      longitude,
      capturedAt: captured.value
    }
  }
}
