import UserPresence from '../../models/UserPresence.js'
import { parseCoordinate } from '../reports/validateReportInput.js'

export const ACTIVE_WINDOW_MS = 15 * 60 * 1000

export function validatePosition(body) {
  const input = body ?? {}
  const errors = {}

  const latitude = parseCoordinate(input.latitude)
  if (latitude === null || latitude < -90 || latitude > 90) {
    errors.latitude = 'latitude must be a number between -90 and 90'
  }

  const longitude = parseCoordinate(input.longitude)
  if (longitude === null || longitude < -180 || longitude > 180) {
    errors.longitude = 'longitude must be a number between -180 and 180'
  }

  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  return { value: { latitude, longitude } }
}

export function activeSince(now = new Date()) {
  return new Date(now.getTime() - ACTIVE_WINDOW_MS)
}

export function saveUserPosition(userId, { latitude, longitude }) {
  return UserPresence.findOneAndUpdate(
    { user: userId },
    {
      location: { type: 'Point', coordinates: [longitude, latitude] },
      updatedAt: new Date()
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  )
}

export async function isUserActive(userId, now = new Date()) {
  const presence = await UserPresence.exists({
    user: userId,
    updatedAt: { $gte: activeSince(now) }
  })
  return presence !== null
}
