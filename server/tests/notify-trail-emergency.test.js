import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn()
  }
}))

import webpush from 'web-push'
import Trail from '../src/models/Trail.js'
import User from '../src/models/User.js'
import UserPresence from '../src/models/UserPresence.js'
import NotificationLog from '../src/models/NotificationLog.js'
import SentAlert from '../src/models/SentAlert.js'
import TrailStatusHistory from '../src/models/TrailStatusHistory.js'
import { TRAIL_STATUS_CHANGED } from '../src/services/trailEvents.js'
import {
  notifyTrailEmergency,
  registerEmergencyNotifications
} from '../src/services/notifyTrailEmergency.js'

let mongod
let trail
let admin

const NEAR = [10.905, 46.1805]
const FAR = [10.905, 46.2]

beforeAll(async () => {
  process.env.VAPID_SUBJECT = 'mailto:test@ecotrail.test'
  process.env.VAPID_PUBLIC_KEY = 'test-public-key'
  process.env.VAPID_PRIVATE_KEY = 'test-private-key'

  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await UserPresence.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([
    Trail.deleteMany({}),
    User.deleteMany({}),
    UserPresence.deleteMany({}),
    NotificationLog.deleteMany({}),
    SentAlert.deleteMany({}),
    TrailStatusHistory.deleteMany({})
  ])

  webpush.sendNotification.mockReset()
  webpush.sendNotification.mockResolvedValue()
  vi.restoreAllMocks()

  trail = await Trail.create({
    name: 'Sentiero delle Grotte',
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, 46.18],
        [10.91, 46.18]
      ]
    }
  })
  admin = await User.create({ email: 'admin@ecotrail.test', password: 'hashed', role: 'admin' })
})

async function createHiker(name, coordinates, { subscribed = true, minutesAgo = 0 } = {}) {
  const user = await User.create({
    email: `${name}@ecotrail.test`,
    password: 'hashed',
    pushSubscriptions: subscribed
      ? [{ endpoint: `https://push.test/${name}`, keys: { p256dh: 'x', auth: 'y' } }]
      : []
  })
  await UserPresence.create({
    user: user._id,
    location: { type: 'Point', coordinates },
    updatedAt: new Date(Date.now() - minutesAgo * 60 * 1000)
  })
  return user
}

async function createHistoryEntry(newStatus) {
  return TrailStatusHistory.create({
    trail: trail._id,
    previousStatus: 'free',
    newStatus,
    reason: 'Rockfall',
    changedBy: admin._id
  })
}

async function emergency(newStatus = 'closed', overrides = {}) {
  const entry = await createHistoryEntry(newStatus)
  const count = await notifyTrailEmergency({
    trailId: trail._id,
    trailName: trail.name,
    newStatus,
    reason: 'Rockfall',
    historyEntryId: entry._id,
    ...overrides
  })
  return { count, entry }
}

function sentPayloads() {
  return webpush.sendNotification.mock.calls.map(([, body]) => JSON.parse(body))
}

describe('notifyTrailEmergency', () => {
  it('alerts all and only the active users near the trail', async () => {
    await createHiker('near', NEAR)
    await createHiker('far', FAR)
    await createHiker('stale', NEAR, { minutesAgo: 16 })

    const { count } = await emergency('closed')

    expect(count).toBe(1)
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
    expect(webpush.sendNotification.mock.calls[0][0].endpoint).toBe('https://push.test/near')
  })

  it('sends the trail name, the reason and a link that opens it on the map', async () => {
    await createHiker('near', NEAR)

    await emergency('closed')

    const [payload] = sentPayloads()
    expect(payload.body).toContain('Sentiero delle Grotte')
    expect(payload.body).toContain('closed')
    expect(payload.body).toContain('Rockfall')
    expect(payload.url).toBe(`/?trail=${trail._id}`)
  })

  it('alerts for at_risk too, wording the status as "at risk"', async () => {
    await createHiker('near', NEAR)

    const { count } = await emergency('at_risk')

    expect(count).toBe(1)
    expect(sentPayloads()[0].body).toContain('at risk')
  })

  it.each(['free', 'crowded'])('sends nothing when the new status is %s', async (status) => {
    await createHiker('near', NEAR)

    const { count } = await emergency(status)

    expect(count).toBe(0)
    expect(webpush.sendNotification).not.toHaveBeenCalled()
    expect(await NotificationLog.countDocuments()).toBe(0)
  })

  it('skips nearby users who have no push subscription', async () => {
    await createHiker('subscribed', NEAR)
    await createHiker('unsubscribed', NEAR, { subscribed: false })

    const { count } = await emergency('closed')

    expect(count).toBe(1)
    expect(await NotificationLog.countDocuments()).toBe(1)
  })

  it('writes one log row per alerted user', async () => {
    const first = await createHiker('first', NEAR)
    const second = await createHiker('second', NEAR)

    await emergency('closed')

    const logs = await NotificationLog.find({})
    expect(logs.map((log) => log.recipient.toString()).sort()).toEqual(
      [first._id.toString(), second._id.toString()].sort()
    )
    expect(logs.every((log) => log.type === 'emergency')).toBe(true)
    expect(logs.every((log) => log.relatedTrail.equals(trail._id))).toBe(true)
    expect(logs[0].message).toContain('Sentiero delle Grotte')
  })

  it('stores how many users were alerted on the history entry', async () => {
    await createHiker('first', NEAR)
    await createHiker('second', NEAR)

    const { entry } = await emergency('closed')

    const updated = await TrailStatusHistory.findById(entry._id)
    expect(updated.alertedCount).toBe(2)
  })

  it('keeps going and does not count a user whose push fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await createHiker('broken', NEAR)
    await createHiker('working', NEAR)
    webpush.sendNotification.mockImplementation((subscription) =>
      subscription.endpoint.endsWith('broken')
        ? Promise.reject(Object.assign(new Error('push service down'), { statusCode: 500 }))
        : Promise.resolve()
    )

    const { count, entry } = await emergency('closed')

    expect(count).toBe(1)
    expect((await TrailStatusHistory.findById(entry._id)).alertedCount).toBe(1)
    expect(await NotificationLog.countDocuments()).toBe(1)
  })

  it('records a SentAlert for each alerted user, so 3.7 does not repeat the alert', async () => {
    const hiker = await createHiker('near', NEAR)

    await emergency('closed')

    const alerts = await SentAlert.find({})
    expect(alerts).toHaveLength(1)
    expect(alerts[0].user.equals(hiker._id)).toBe(true)
    expect(alerts[0].trail.equals(trail._id)).toBe(true)
    expect(alerts[0].status).toBe('closed')
  })

  it('clears the previous SentAlerts of the trail on every status change', async () => {
    const hiker = await createHiker('near', NEAR)
    await emergency('closed')
    expect(await SentAlert.countDocuments()).toBe(1)

    await emergency('free')

    expect(await SentAlert.countDocuments()).toBe(0)

    await emergency('closed')

    const alerts = await SentAlert.find({})
    expect(alerts).toHaveLength(1)
    expect(alerts[0].user.equals(hiker._id)).toBe(true)
  })

  it('does nothing when the trail no longer exists', async () => {
    await createHiker('near', NEAR)

    const count = await notifyTrailEmergency({
      trailId: new mongoose.Types.ObjectId(),
      trailName: 'Ghost trail',
      newStatus: 'closed',
      reason: 'Test'
    })

    expect(count).toBe(0)
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })
})

describe('registerEmergencyNotifications', () => {
  it('alerts nearby users when a trail status change event is emitted', async () => {
    await createHiker('near', NEAR)
    const events = new EventEmitter()
    registerEmergencyNotifications(events)
    const entry = await createHistoryEntry('closed')

    events.emit(TRAIL_STATUS_CHANGED, {
      trailId: trail._id,
      trailName: trail.name,
      newStatus: 'closed',
      reason: 'Rockfall',
      historyEntryId: entry._id
    })

    await vi.waitFor(async () => {
      expect((await TrailStatusHistory.findById(entry._id)).alertedCount).toBe(1)
    })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('logs instead of throwing when the notification fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const events = new EventEmitter()
    registerEmergencyNotifications(events)

    events.emit(TRAIL_STATUS_CHANGED, {
      trailId: 'not-an-object-id',
      trailName: 'Broken',
      newStatus: 'closed',
      reason: 'Test'
    })

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
  })
})
