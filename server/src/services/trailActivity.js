import TrailActivity from '../models/TrailActivity.js'
import { findNearestTrail } from './findNearestTrail.js'

const HOUR_MS = 60 * 60 * 1000
const DUPLICATE_KEY_ERROR = 11000

export function startOfHour(date) {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS)
}

export async function addTrailVisitor(trailId, userId, at = new Date()) {
  const filter = { trail: trailId, hour: startOfHour(at) }
  const update = { $addToSet: { users: userId } }

  try {
    await TrailActivity.updateOne(filter, update, { upsert: true })
  } catch (err) {
    if (err.code !== DUPLICATE_KEY_ERROR) throw err
    await TrailActivity.updateOne(filter, update)
  }
}

export async function recordTrailActivity(userId, { latitude, longitude }, at = new Date()) {
  const trail = await findNearestTrail(latitude, longitude)
  if (!trail) return null

  await addTrailVisitor(trail._id, userId, at)
  return trail
}
