import { Router } from 'express'
import mongoose from 'mongoose'
import Notification, { NOTIFICATION_TYPES } from '../models/Notification.js'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'
import {
  MUTED_INDEFINITELY_UNTIL,
  MUTE_OPTIONS_MINUTES,
  RADIUS_OPTIONS_METERS,
  isMuted,
  isMutedIndefinitely
} from '../config/notificationPreferences.js'

const router = Router()

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 50
const INDEFINITE = 'indefinite'

function notificationToResponse(notification) {
  return {
    id: notification._id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    url: notification.url,
    trailId: notification.trail ?? null,
    sentAt: notification.sentAt,
    readAt: notification.readAt
  }
}

function preferencesToResponse(user) {
  const preferences = user.notificationPreferences
  const muted = isMuted(preferences)

  return {
    radiusMeters: preferences.radiusMeters,
    alertTypes: preferences.alertTypes,
    mutedUntil: muted && !isMutedIndefinitely(preferences) ? preferences.mutedUntil : null,
    mutedIndefinitely: muted && isMutedIndefinitely(preferences),
    options: {
      radiusMeters: RADIUS_OPTIONS_METERS,
      alertTypes: NOTIFICATION_TYPES,
      muteMinutes: MUTE_OPTIONS_MINUTES
    }
  }
}

function parseLimit(raw) {
  if (raw === undefined) return DEFAULT_LIMIT
  const limit = Number(raw)
  return Number.isInteger(limit) && limit >= 1 ? Math.min(limit, MAX_LIMIT) : null
}

function parseBefore(raw) {
  if (raw === undefined) return undefined
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

router.get('/', requireAuth, async (req, res) => {
  const limit = parseLimit(req.query.limit)
  if (limit === null) {
    return res.status(400).json({ error: 'limit must be a positive integer' })
  }

  const before = parseBefore(req.query.before)
  if (before === null) {
    return res.status(400).json({ error: 'before must be a valid date' })
  }

  const filter = { user: req.user.id }
  if (before) filter.sentAt = { $lt: before }

  const [found, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ sentAt: -1 })
      .limit(limit + 1),
    Notification.countDocuments({ user: req.user.id, readAt: null })
  ])

  res.json({
    notifications: found.slice(0, limit).map(notificationToResponse),
    hasMore: found.length > limit,
    unreadCount
  })
})

router.patch('/read-all', requireAuth, async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user.id, readAt: null },
    { readAt: new Date() }
  )

  res.json({ updated: result.modifiedCount })
})

router.get('/preferences', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id)
  if (!user) {
    return res.status(404).json({ error: 'User not found' })
  }

  res.json(preferencesToResponse(user))
})

router.patch('/preferences', requireAuth, async (req, res) => {
  const { radiusMeters, alertTypes, mute } = req.body ?? {}
  const update = {}

  if (radiusMeters !== undefined) {
    if (!RADIUS_OPTIONS_METERS.includes(radiusMeters)) {
      return res
        .status(400)
        .json({ error: `radiusMeters must be one of: ${RADIUS_OPTIONS_METERS.join(', ')}` })
    }
    update['notificationPreferences.radiusMeters'] = radiusMeters
  }

  if (alertTypes !== undefined) {
    const valid =
      Array.isArray(alertTypes) &&
      alertTypes.every((type) => NOTIFICATION_TYPES.includes(type)) &&
      new Set(alertTypes).size === alertTypes.length
    if (!valid) {
      return res.status(400).json({
        error: `alertTypes must be a list without duplicates of: ${NOTIFICATION_TYPES.join(', ')}`
      })
    }
    update['notificationPreferences.alertTypes'] = alertTypes
  }

  if (mute !== undefined) {
    if (mute === null) {
      update['notificationPreferences.mutedUntil'] = null
    } else if (mute === INDEFINITE) {
      update['notificationPreferences.mutedUntil'] = MUTED_INDEFINITELY_UNTIL
    } else if (MUTE_OPTIONS_MINUTES.includes(mute)) {
      update['notificationPreferences.mutedUntil'] = new Date(Date.now() + mute * 60 * 1000)
    } else {
      return res.status(400).json({
        error: `mute must be null, "${INDEFINITE}" or one of: ${MUTE_OPTIONS_MINUTES.join(', ')} (minutes)`
      })
    }
  }

  if (Object.keys(update).length === 0) {
    return res
      .status(400)
      .json({ error: 'Provide at least one of: radiusMeters, alertTypes, mute' })
  }

  const user = await User.findByIdAndUpdate(req.user.id, update, { returnDocument: 'after' })
  if (!user) {
    return res.status(404).json({ error: 'User not found' })
  }

  res.json(preferencesToResponse(user))
})

router.patch('/:id/read', requireAuth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid notification id' })
  }

  const notification = await Notification.findOne({ _id: req.params.id, user: req.user.id })
  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' })
  }

  if (!notification.readAt) {
    notification.readAt = new Date()
    await notification.save()
  }

  res.json(notificationToResponse(notification))
})

export default router
