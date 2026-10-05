import Trail from '../models/Trail.js'
import TrailStatusHistory from '../models/TrailStatusHistory.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import { findNearbyUsers } from './findNearbyUsers.js'
import { findNearestTrail, MAX_TRAIL_DISTANCE_METERS } from './findNearestTrail.js'
import { sendPush } from './sendPush.js'
import { trailEvents, TRAIL_STATUS_CHANGED } from './trailEvents.js'

export const USERS_PER_KM = 4
export const MIN_CROWD_THRESHOLD = 3
export const MAX_CROWD_THRESHOLD = 40
export const FALLBACK_CROWD_THRESHOLD = 10
export const RELEASE_RATIO = 0.7

export const NOTIFICATION_SEARCH_RADIUS_METERS = 5000
export const ALTERNATIVE_MAX_DISTANCE_METERS = 10000

export const TRAIL_COOLDOWN_MS = 2 * 60 * 60 * 1000
export const GLOBAL_COOLDOWN_MS = 30 * 60 * 1000
export const SWEEP_INTERVAL_MS = 60 * 1000

export function defaultCrowdThreshold(trail) {
  if (!trail.distanceKm) return FALLBACK_CROWD_THRESHOLD
  const scaled = Math.round(trail.distanceKm * USERS_PER_KM)
  return Math.min(MAX_CROWD_THRESHOLD, Math.max(MIN_CROWD_THRESHOLD, scaled))
}

export function defaultReleaseThreshold(enterThreshold) {
  return Math.max(1, Math.min(enterThreshold - 1, Math.round(enterThreshold * RELEASE_RATIO)))
}

export function getCrowdThresholds(trail) {
  const enter = trail.crowdThreshold ?? defaultCrowdThreshold(trail)
  const release = trail.crowdReleaseThreshold ?? defaultReleaseThreshold(enter)
  return { enter, release: Math.min(release, enter - 1) }
}

export async function findAlternativeTrail(trail) {
  const coordinates = trail.path.coordinates
  const middle = coordinates[Math.floor(coordinates.length / 2)]

  return Trail.findOne({
    _id: { $ne: trail._id },
    status: 'free',
    path: {
      $near: {
        $geometry: { type: 'Point', coordinates: middle },
        $maxDistance: ALTERNATIVE_MAX_DISTANCE_METERS
      }
    }
  })
    .select('name')
    .lean()
}

function isBlockedByCooldown(recentNotifications, trailId, now) {
  return recentNotifications.some(
    (notification) =>
      String(notification.trail) === String(trailId) ||
      now.getTime() - notification.sentAt.getTime() < GLOBAL_COOLDOWN_MS
  )
}

function buildMessage(trail, alternative, isOnTrail) {
  if (!isOnTrail) {
    return {
      title: 'Trail getting crowded',
      body: `"${trail.name}" is crowded right now.`,
      url: `/?trail=${trail._id}`
    }
  }

  if (!alternative) {
    return {
      title: 'Crowded trail',
      body: `"${trail.name}" is getting crowded. Consider a quieter route.`,
      url: `/?trail=${trail._id}`
    }
  }

  return {
    title: 'Crowded trail',
    body: `"${trail.name}" is getting crowded. A quieter option nearby: "${alternative.name}".`,
    url: `/?trail=${alternative._id}`
  }
}

async function notifyOvercrowding(trail, onTrail, now) {
  const nearby = await findNearbyUsers(trail.path, {
    radiusMeters: NOTIFICATION_SEARCH_RADIUS_METERS,
    now
  })
  if (nearby.length === 0) return

  const distanceByUser = new Map(
    nearby.map((match) => [String(match.userId), match.distanceMeters])
  )
  const onTrailIds = new Set(onTrail.map((match) => String(match.userId)))

  const [users, recent] = await Promise.all([
    User.find({
      _id: { $in: nearby.map((match) => match.userId) },
      'notificationPreferences.alertTypes': 'overcrowd'
    }),
    Notification.find({
      user: { $in: nearby.map((match) => match.userId) },
      type: 'overcrowd',
      sentAt: { $gte: new Date(now.getTime() - TRAIL_COOLDOWN_MS) }
    })
      .select('user trail sentAt')
      .lean()
  ])

  const recentByUser = new Map()
  for (const notification of recent) {
    const key = String(notification.user)
    recentByUser.set(key, [...(recentByUser.get(key) ?? []), notification])
  }

  const recipients = users.filter((user) => {
    const key = String(user._id)
    const isOnTrail = onTrailIds.has(key)
    const withinRadius = distanceByUser.get(key) <= user.notificationPreferences.radiusMeters
    if (!isOnTrail && !withinRadius) return false
    return !isBlockedByCooldown(recentByUser.get(key) ?? [], trail._id, now)
  })
  if (recipients.length === 0) return

  const alternative = recipients.some((user) => onTrailIds.has(String(user._id)))
    ? await findAlternativeTrail(trail)
    : null

  for (const user of recipients) {
    const message = buildMessage(trail, alternative, onTrailIds.has(String(user._id)))
    try {
      await sendPush(user, message, { type: 'overcrowd', trail: trail._id })
    } catch (err) {
      console.error(`[overcrowding] push to user ${user._id} failed:`, err.message)
    }
  }
}

async function applyStatusChange(trail, newStatus, reason) {
  const updated = await Trail.findOneAndUpdate(
    { _id: trail._id, status: trail.status },
    { status: newStatus },
    { returnDocument: 'after' }
  ).lean()
  if (!updated) return null

  await TrailStatusHistory.create({
    trail: trail._id,
    previousStatus: trail.status,
    newStatus,
    reason,
    changedBy: null
  })

  trailEvents.emit(TRAIL_STATUS_CHANGED, {
    trailId: trail._id,
    trailName: trail.name,
    previousStatus: trail.status,
    newStatus,
    reason,
    changedBy: null
  })

  return updated
}

export async function checkTrailOvercrowding(trailId, { now = new Date() } = {}) {
  const trail = await Trail.findById(trailId).lean()
  if (!trail || (trail.status !== 'free' && trail.status !== 'crowded')) {
    return { changed: false }
  }

  const onTrail = await findNearbyUsers(trail.path, {
    radiusMeters: MAX_TRAIL_DISTANCE_METERS,
    now
  })
  const count = onTrail.length
  const { enter, release } = getCrowdThresholds(trail)

  if (trail.status === 'free' && count >= enter) {
    const reason = `Automatic: ${count} active hikers on the trail (threshold ${enter})`
    const updated = await applyStatusChange(trail, 'crowded', reason)
    if (!updated) return { changed: false, count }

    await notifyOvercrowding(updated, onTrail, now).catch((err) => {
      console.error('[overcrowding] notification failed:', err.message)
    })
    return { changed: true, status: 'crowded', count }
  }

  if (trail.status === 'crowded' && count <= release) {
    const reason = `Automatic: ${count} active hikers left on the trail (release at ${release})`
    const updated = await applyStatusChange(trail, 'free', reason)
    return updated ? { changed: true, status: 'free', count } : { changed: false, count }
  }

  return { changed: false, count }
}

export async function checkOvercrowdingNear(latitude, longitude, options) {
  const trail = await findNearestTrail(latitude, longitude)
  if (!trail) return { changed: false }
  return checkTrailOvercrowding(trail._id, options)
}

export async function sweepCrowdedTrails(options) {
  const crowded = await Trail.find({ status: 'crowded' }).select('_id').lean()

  for (const trail of crowded) {
    try {
      await checkTrailOvercrowding(trail._id, options)
    } catch (err) {
      console.error(`[overcrowding] sweep failed for trail ${trail._id}:`, err.message)
    }
  }
}

export function startCrowdSweep(intervalMs = SWEEP_INTERVAL_MS) {
  const timer = setInterval(() => {
    sweepCrowdedTrails().catch((err) => console.error('[overcrowding] sweep failed:', err.message))
  }, intervalMs)
  timer.unref()
  return timer
}
