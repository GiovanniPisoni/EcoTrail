import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../src/index.js'
import User from '../../src/models/User.js'
import Notification from '../../src/models/Notification.js'
import {
  MUTED_INDEFINITELY_UNTIL,
  RADIUS_OPTIONS_METERS
} from '../../src/config/notificationPreferences.js'

const JWT_SECRET = 'test-secret'
const MINUTE_MS = 60 * 1000

let mongod

async function createUserAndToken(email = 'hiker@ecotrail.test') {
  const user = await User.create({ email, password: 'hashed', role: 'hiker' })
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  return { user, token }
}

function createNotification(user, minutesAgo, overrides = {}) {
  return Notification.create({
    user: user._id,
    type: 'emergency',
    title: 'EcoTrail alert',
    body: `Alert from ${minutesAgo} minutes ago`,
    url: '/?trail=abc',
    sentAt: new Date(Date.now() - minutesAgo * MINUTE_MS),
    ...overrides
  })
}

function get(path, token) {
  const req = request(app).get(path)
  return token ? req.set('Authorization', `Bearer ${token}`) : req
}

function patch(path, token, body) {
  const req = request(app).patch(path)
  if (token) req.set('Authorization', `Bearer ${token}`)
  return body === undefined ? req : req.send(body)
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Notification.deleteMany({})])
})

describe('GET /api/notifications', () => {
  it('returns 401 without a token', async () => {
    expect((await get('/api/notifications')).status).toBe(401)
  })

  it('returns only the notifications of the logged-in user, most recent first', async () => {
    const { user, token } = await createUserAndToken()
    const { user: other } = await createUserAndToken('other@ecotrail.test')
    await createNotification(user, 30)
    await createNotification(user, 5)
    await createNotification(other, 1)

    const res = await get('/api/notifications', token)

    expect(res.status).toBe(200)
    expect(res.body.notifications.map((n) => n.body)).toEqual([
      'Alert from 5 minutes ago',
      'Alert from 30 minutes ago'
    ])
    expect(res.body.hasMore).toBe(false)
  })

  it('exposes what the client needs to show and open a notification', async () => {
    const { user, token } = await createUserAndToken()
    await createNotification(user, 5, { type: 'approach' })

    const [notification] = (await get('/api/notifications', token)).body.notifications

    expect(notification).toMatchObject({
      type: 'approach',
      title: 'EcoTrail alert',
      url: '/?trail=abc',
      readAt: null
    })
    expect(notification.id).toBeDefined()
    expect(notification.sentAt).toBeDefined()
  })

  it('counts the unread notifications of the user, regardless of the page size', async () => {
    const { user, token } = await createUserAndToken()
    await createNotification(user, 30)
    await createNotification(user, 20)
    await createNotification(user, 10, { readAt: new Date() })

    const res = await get('/api/notifications?limit=1', token)

    expect(res.body.unreadCount).toBe(2)
  })

  it('pages through the history with limit and before', async () => {
    const { user, token } = await createUserAndToken()
    for (const minutesAgo of [40, 30, 20, 10]) await createNotification(user, minutesAgo)

    const first = await get('/api/notifications?limit=3', token)
    expect(first.body.notifications).toHaveLength(3)
    expect(first.body.hasMore).toBe(true)

    const oldestShown = first.body.notifications.at(-1).sentAt
    const second = await get(`/api/notifications?limit=3&before=${oldestShown}`, token)

    expect(second.body.notifications.map((n) => n.body)).toEqual(['Alert from 40 minutes ago'])
    expect(second.body.hasMore).toBe(false)
  })

  it.each(['0', '-2', 'abc', '1.5'])('returns 400 for an invalid limit (%s)', async (limit) => {
    const { token } = await createUserAndToken()

    expect((await get(`/api/notifications?limit=${limit}`, token)).status).toBe(400)
  })

  it('returns 400 for an invalid before date', async () => {
    const { token } = await createUserAndToken()

    expect((await get('/api/notifications?before=yesterday', token)).status).toBe(400)
  })

  it('caps the page size', async () => {
    const { user, token } = await createUserAndToken()
    for (let i = 0; i < 52; i++) await createNotification(user, i + 1)

    const res = await get('/api/notifications?limit=500', token)

    expect(res.body.notifications).toHaveLength(50)
    expect(res.body.hasMore).toBe(true)
  })
})

describe('PATCH /api/notifications/:id/read', () => {
  it('returns 401 without a token', async () => {
    const id = new mongoose.Types.ObjectId()
    expect((await patch(`/api/notifications/${id}/read`)).status).toBe(401)
  })

  it('marks the notification as read', async () => {
    const { user, token } = await createUserAndToken()
    const notification = await createNotification(user, 5)

    const res = await patch(`/api/notifications/${notification._id}/read`, token)

    expect(res.status).toBe(200)
    expect(res.body.readAt).not.toBeNull()
    expect((await Notification.findById(notification._id)).readAt).not.toBeNull()
  })

  it('keeps the original read time when called again', async () => {
    const { user, token } = await createUserAndToken()
    const readAt = new Date(Date.now() - 10 * MINUTE_MS)
    const notification = await createNotification(user, 20, { readAt })

    const res = await patch(`/api/notifications/${notification._id}/read`, token)

    expect(new Date(res.body.readAt).getTime()).toBe(readAt.getTime())
  })

  it("returns 404 for someone else's notification, leaving it unread", async () => {
    const { token } = await createUserAndToken()
    const { user: other } = await createUserAndToken('other@ecotrail.test')
    const notification = await createNotification(other, 5)

    const res = await patch(`/api/notifications/${notification._id}/read`, token)

    expect(res.status).toBe(404)
    expect((await Notification.findById(notification._id)).readAt).toBeNull()
  })

  it('returns 404 for a notification that does not exist', async () => {
    const { token } = await createUserAndToken()
    const id = new mongoose.Types.ObjectId()

    expect((await patch(`/api/notifications/${id}/read`, token)).status).toBe(404)
  })

  it('returns 400 for an invalid id', async () => {
    const { token } = await createUserAndToken()

    expect((await patch('/api/notifications/not-an-id/read', token)).status).toBe(400)
  })
})

describe('PATCH /api/notifications/read-all', () => {
  it('returns 401 without a token', async () => {
    expect((await patch('/api/notifications/read-all')).status).toBe(401)
  })

  it("marks all of the user's notifications as read and leaves other users' alone", async () => {
    const { user, token } = await createUserAndToken()
    const { user: other } = await createUserAndToken('other@ecotrail.test')
    await createNotification(user, 10)
    await createNotification(user, 20)
    await createNotification(other, 5)

    const res = await patch('/api/notifications/read-all', token)

    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(2)
    expect(await Notification.countDocuments({ user: user._id, readAt: null })).toBe(0)
    expect(await Notification.countDocuments({ user: other._id, readAt: null })).toBe(1)
  })
})

describe('GET /api/notifications/preferences', () => {
  it('returns 401 without a token', async () => {
    expect((await get('/api/notifications/preferences')).status).toBe(401)
  })

  it('returns the defaults and the options the client can offer', async () => {
    const { token } = await createUserAndToken()

    const res = await get('/api/notifications/preferences', token)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      radiusMeters: 1000,
      alertTypes: ['emergency', 'approach', 'overcrowd'],
      mutedUntil: null,
      mutedIndefinitely: false
    })
    expect(res.body.options.radiusMeters).toEqual(RADIUS_OPTIONS_METERS)
    expect(res.body.options.alertTypes).toEqual(['emergency', 'approach', 'overcrowd'])
    expect(res.body.options.muteMinutes).toEqual([60, 480, 1440])
  })

  it('does not report a mute that has already ended', async () => {
    const { user, token } = await createUserAndToken()
    await User.findByIdAndUpdate(user._id, {
      'notificationPreferences.mutedUntil': new Date(Date.now() - MINUTE_MS)
    })

    const res = await get('/api/notifications/preferences', token)

    expect(res.body.mutedUntil).toBeNull()
    expect(res.body.mutedIndefinitely).toBe(false)
  })
})

describe('PATCH /api/notifications/preferences', () => {
  it('returns 401 without a token', async () => {
    expect(
      (await patch('/api/notifications/preferences', null, { radiusMeters: 500 })).status
    ).toBe(401)
  })

  it('saves the radius on the server', async () => {
    const { user, token } = await createUserAndToken()

    const res = await patch('/api/notifications/preferences', token, { radiusMeters: 2000 })

    expect(res.status).toBe(200)
    expect(res.body.radiusMeters).toBe(2000)
    expect((await User.findById(user._id)).notificationPreferences.radiusMeters).toBe(2000)
  })

  it.each([750, 0, '1000', null])('rejects a radius that is not on offer (%j)', async (radius) => {
    const { token } = await createUserAndToken()

    const res = await patch('/api/notifications/preferences', token, { radiusMeters: radius })

    expect(res.status).toBe(400)
  })

  it('saves the alert types, including turning every type off', async () => {
    const { user, token } = await createUserAndToken()

    await patch('/api/notifications/preferences', token, { alertTypes: ['emergency'] })
    expect((await User.findById(user._id)).notificationPreferences.alertTypes).toEqual([
      'emergency'
    ])

    const res = await patch('/api/notifications/preferences', token, { alertTypes: [] })
    expect(res.status).toBe(200)
    expect((await User.findById(user._id)).notificationPreferences.alertTypes).toEqual([])
  })

  it.each([['storm'], ['emergency', 'emergency'], 'emergency', [1]])(
    'rejects invalid alert types (%j)',
    async (alertTypes) => {
      const { token } = await createUserAndToken()

      const res = await patch('/api/notifications/preferences', token, { alertTypes })

      expect(res.status).toBe(400)
    }
  )

  it('mutes alerts for a chosen amount of time', async () => {
    const { user, token } = await createUserAndToken()
    const before = Date.now()

    const res = await patch('/api/notifications/preferences', token, { mute: 60 })

    expect(res.status).toBe(200)
    expect(res.body.mutedIndefinitely).toBe(false)
    const mutedUntil = new Date(res.body.mutedUntil).getTime()
    expect(mutedUntil).toBeGreaterThanOrEqual(before + 60 * MINUTE_MS)
    expect(mutedUntil).toBeLessThan(before + 61 * MINUTE_MS)
    expect((await User.findById(user._id)).notificationPreferences.mutedUntil).not.toBeNull()
  })

  it('mutes alerts until the user turns them back on', async () => {
    const { user, token } = await createUserAndToken()

    const res = await patch('/api/notifications/preferences', token, { mute: 'indefinite' })

    expect(res.status).toBe(200)
    expect(res.body.mutedIndefinitely).toBe(true)
    expect(res.body.mutedUntil).toBeNull()
    expect((await User.findById(user._id)).notificationPreferences.mutedUntil).toEqual(
      MUTED_INDEFINITELY_UNTIL
    )
  })

  it('turns the mute off with null', async () => {
    const { token } = await createUserAndToken()
    await patch('/api/notifications/preferences', token, { mute: 'indefinite' })

    const res = await patch('/api/notifications/preferences', token, { mute: null })

    expect(res.status).toBe(200)
    expect(res.body.mutedIndefinitely).toBe(false)
    expect(res.body.mutedUntil).toBeNull()
  })

  it.each([5, 'forever', -60, '60'])(
    'rejects a mute duration that is not on offer (%j)',
    async (mute) => {
      const { token } = await createUserAndToken()

      expect((await patch('/api/notifications/preferences', token, { mute })).status).toBe(400)
    }
  )

  it('returns 400 when nothing to change is provided', async () => {
    const { token } = await createUserAndToken()

    expect((await patch('/api/notifications/preferences', token, {})).status).toBe(400)
    expect((await patch('/api/notifications/preferences', token)).status).toBe(400)
  })

  it('changes only what was sent', async () => {
    const { user, token } = await createUserAndToken()

    await patch('/api/notifications/preferences', token, { radiusMeters: 5000 })

    const saved = (await User.findById(user._id)).notificationPreferences
    expect(saved.radiusMeters).toBe(5000)
    expect(saved.alertTypes).toEqual(['emergency', 'approach', 'overcrowd'])
    expect(saved.mutedUntil).toBeNull()
  })
})
