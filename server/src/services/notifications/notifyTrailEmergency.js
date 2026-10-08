import Trail from '../../models/Trail.js'
import User from '../../models/User.js'
import SentAlert from '../../models/SentAlert.js'
import TrailStatusHistory from '../../models/TrailStatusHistory.js'
import { MAX_RADIUS_METERS, isMuted } from '../../config/notificationPreferences.js'
import { findNearbyUsers } from '../presence/findNearbyUsers.js'
import { sendPush } from './sendPush.js'
import { trailEvents, TRAIL_STATUS_CHANGED } from '../trails/trailEvents.js'

export const EMERGENCY_STATUSES = ['at_risk', 'closed']

const STATUS_LABELS = { at_risk: 'at risk', closed: 'closed' }

async function alertUser(user, trailId, newStatus, message, historyEntryId) {
  await sendPush(
    user,
    { title: 'EcoTrail alert', body: message, url: `/?trail=${trailId}` },
    { type: 'emergency', trail: trailId }
  )

  await SentAlert.updateOne(
    { user: user._id, trail: trailId, status: newStatus },
    {},
    { upsert: true }
  )

  if (isMuted(user.notificationPreferences)) return false

  if (historyEntryId) {
    await TrailStatusHistory.findByIdAndUpdate(historyEntryId, { $inc: { alertedCount: 1 } })
  }
  return true
}

export async function notifyTrailEmergency({
  trailId,
  trailName,
  newStatus,
  reason,
  historyEntryId
}) {
  await SentAlert.deleteMany({ trail: trailId, report: { $exists: false } })

  if (!EMERGENCY_STATUSES.includes(newStatus)) return 0

  const trail = await Trail.findById(trailId).select('path').lean()
  if (!trail) return 0

  const nearby = await findNearbyUsers(trail.path, { radiusMeters: MAX_RADIUS_METERS })
  const distanceByUser = new Map(
    nearby.map((match) => [String(match.userId), match.distanceMeters])
  )

  const candidates = await User.find({
    _id: { $in: nearby.map((match) => match.userId) },
    'pushSubscriptions.0': { $exists: true },
    'notificationPreferences.alertTypes': 'emergency'
  })
  const users = candidates.filter(
    (user) => distanceByUser.get(String(user._id)) <= user.notificationPreferences.radiusMeters
  )

  const message = `${trailName} is now ${STATUS_LABELS[newStatus]}: ${reason}`
  const results = await Promise.allSettled(
    users.map((user) => alertUser(user, trailId, newStatus, message, historyEntryId))
  )

  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('[emergency-notification] could not alert a user:', result.reason)
    }
  })

  return results.filter((result) => result.status === 'fulfilled' && result.value).length
}

export function registerEmergencyNotifications(events = trailEvents) {
  events.on(TRAIL_STATUS_CHANGED, (payload) => {
    notifyTrailEmergency(payload).catch((err) => {
      console.error('[emergency-notification] failed:', err)
    })
  })
}
