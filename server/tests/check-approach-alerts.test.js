import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
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
import Report from '../src/models/Report.js'
import User from '../src/models/User.js'
import UserPresence from '../src/models/UserPresence.js'
import Notification from '../src/models/Notification.js'
import SentAlert from '../src/models/SentAlert.js'
import {
  checkApproachAlerts,
  SERIOUS_REPORT_MAX_AGE_MS
} from '../src/services/checkApproachAlerts.js'
import { notifyTrailEmergency } from '../src/services/notifyTrailEmergency.js'

let mongod
let trail
let hiker

const NEAR = { latitude: 46.1805, longitude: 10.905 }
const FAR = { latitude: 46.2, longitude: 10.905 }
const DAY_MS = 24 * 60 * 60 * 1000

beforeAll(async () => {
  process.env.VAPID_SUBJECT = 'mailto:test@ecotrail.test'
  process.env.VAPID_PUBLIC_KEY = 'test-public-key'
  process.env.VAPID_PRIVATE_KEY = 'test-private-key'

  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Promise.all([Trail.init(), Report.init(), SentAlert.init(), UserPresence.init()])
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([
    Trail.deleteMany({}),
    Report.deleteMany({}),
    User.deleteMany({}),
    UserPresence.deleteMany({}),
    Notification.deleteMany({}),
    SentAlert.deleteMany({})
  ])

  webpush.sendNotification.mockReset()
  webpush.sendNotification.mockResolvedValue()
  vi.restoreAllMocks()

  trail = await createTrail('Sentiero delle Grotte', 'closed')
  hiker = await createHiker()
})

function createTrail(name, status, longitudeShift = 0) {
  return Trail.create({
    name,
    status,
    path: {
      type: 'LineString',
      coordinates: [
        [10.9 + longitudeShift, 46.18],
        [10.91 + longitudeShift, 46.18]
      ]
    }
  })
}

function createHiker(overrides = {}) {
  return User.create({
    email: 'hiker@ecotrail.test',
    password: 'hashed',
    pushSubscriptions: [{ endpoint: 'https://push.test/hiker', keys: { p256dh: 'x', auth: 'y' } }],
    ...overrides
  })
}

function createReport(overrides = {}) {
  return Report.create({
    author: hiker._id,
    type: 'landslide',
    severity: 'high',
    validationStatus: 'validated',
    trail: trail._id,
    location: { type: 'Point', coordinates: [NEAR.longitude, NEAR.latitude] },
    ...overrides
  })
}

function sentPayloads() {
  return webpush.sendNotification.mock.calls.map(([, body]) => JSON.parse(body))
}

describe('checkApproachAlerts on dangerous trails', () => {
  it('alerts a user who gets close to a closed trail, with a link to it', async () => {
    const sent = await checkApproachAlerts(hiker._id, NEAR)

    expect(sent).toBe(1)
    const [payload] = sentPayloads()
    expect(payload.body).toContain('Sentiero delle Grotte')
    expect(payload.body).toContain('closed')
    expect(payload.url).toBe(`/?trail=${trail._id}`)
  })

  it('alerts for an at_risk trail, wording the status as "at risk"', async () => {
    await Trail.findByIdAndUpdate(trail._id, { status: 'at_risk' })

    await checkApproachAlerts(hiker._id, NEAR)

    expect(sentPayloads()[0].body).toContain('at risk')
  })

  it.each(['free', 'crowded'])('does not alert for a %s trail', async (status) => {
    await Trail.findByIdAndUpdate(trail._id, { status })

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(0)
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('does not alert a user who is farther than the radius', async () => {
    expect(await checkApproachAlerts(hiker._id, FAR)).toBe(0)
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it("uses the radius from the user's preferences", async () => {
    await User.findByIdAndUpdate(hiker._id, { 'notificationPreferences.radiusMeters': 20 })
    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(0)

    await User.findByIdAndUpdate(hiker._id, { 'notificationPreferences.radiusMeters': 300 })
    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(1)
  })

  it('does not repeat the alert while the user keeps moving around the trail', async () => {
    await checkApproachAlerts(hiker._id, NEAR)
    await checkApproachAlerts(hiker._id, { latitude: 46.1806, longitude: 10.906 })
    await checkApproachAlerts(hiker._id, { latitude: 46.1804, longitude: 10.9 })

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
    expect(await SentAlert.countDocuments()).toBe(1)
  })

  it('sends only one push when two positions arrive at the same time', async () => {
    const results = await Promise.all([
      checkApproachAlerts(hiker._id, NEAR),
      checkApproachAlerts(hiker._id, NEAR)
    ])

    expect(results.sort()).toEqual([0, 1])
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('alerts separately for each dangerous trail nearby', async () => {
    await createTrail('Sentiero della Ceda', 'at_risk', 0.001)

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(2)
  })

  it('does not alert again someone already warned by the emergency notification', async () => {
    await UserPresence.create({
      user: hiker._id,
      location: { type: 'Point', coordinates: [NEAR.longitude, NEAR.latitude] }
    })
    await notifyTrailEmergency({
      trailId: trail._id,
      trailName: trail.name,
      newStatus: 'closed',
      reason: 'Rockfall'
    })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(0)
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('alerts again after the trail changes status and becomes dangerous again', async () => {
    await checkApproachAlerts(hiker._id, NEAR)

    await notifyTrailEmergency({
      trailId: trail._id,
      trailName: trail.name,
      newStatus: 'free',
      reason: 'Reopened'
    })

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(1)
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
  })

  it('records the alert for the notification center', async () => {
    await checkApproachAlerts(hiker._id, NEAR)

    const stored = await Notification.find({})
    expect(stored).toHaveLength(1)
    expect(stored[0].type).toBe('approach')
    expect(stored[0].user.equals(hiker._id)).toBe(true)
    expect(stored[0].trail.equals(trail._id)).toBe(true)
    expect(stored[0].url).toBe(`/?trail=${trail._id}`)
  })
})

describe('checkApproachAlerts on serious reports', () => {
  beforeEach(async () => {
    await Trail.findByIdAndUpdate(trail._id, { status: 'free' })
  })

  it('alerts a user who gets close to a validated high-severity report', async () => {
    await createReport()

    const sent = await checkApproachAlerts(hiker._id, NEAR)

    expect(sent).toBe(1)
    const [payload] = sentPayloads()
    expect(payload.body).toContain('Landslide')
    expect(payload.body).toContain('Sentiero delle Grotte')
    expect(payload.url).toBe(`/?trail=${trail._id}`)
  })

  it.each([
    ['still pending', { validationStatus: 'pending' }],
    ['rejected', { validationStatus: 'rejected' }],
    ['withdrawn', { validationStatus: 'withdrawn' }],
    ['not high severity', { severity: 'medium' }],
    ['about overcrowding', { type: 'overcrowding' }],
    ['older than a week', { createdAt: new Date(Date.now() - 8 * DAY_MS) }]
  ])('ignores a report that is %s', async (_label, overrides) => {
    await createReport(overrides)

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(0)
  })

  it('keeps reports for a full week', () => {
    expect(SERIOUS_REPORT_MAX_AGE_MS).toBe(7 * DAY_MS)
  })

  it('ignores a serious report that is out of range', async () => {
    await createReport({ location: { type: 'Point', coordinates: [FAR.longitude, FAR.latitude] } })

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(0)
  })

  it('alerts once per report, even on the same trail', async () => {
    await createReport()
    await createReport({ type: 'fallen_tree' })

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(2)
    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(0)
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
  })

  it('does not forget report alerts when the trail changes status', async () => {
    await createReport()
    await checkApproachAlerts(hiker._id, NEAR)

    await notifyTrailEmergency({
      trailId: trail._id,
      trailName: trail.name,
      newStatus: 'free',
      reason: 'Test'
    })

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(0)
  })
})

describe('checkApproachAlerts guards', () => {
  it('does nothing for a user who turned approach alerts off', async () => {
    await User.findByIdAndUpdate(hiker._id, {
      'notificationPreferences.alertTypes': ['emergency', 'overcrowd']
    })

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(0)
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('does not push to a muted user, but keeps the alert in their history', async () => {
    await User.findByIdAndUpdate(hiker._id, {
      'notificationPreferences.mutedUntil': new Date(Date.now() + 60 * 60 * 1000)
    })

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(0)
    expect(webpush.sendNotification).not.toHaveBeenCalled()
    expect(await Notification.countDocuments({ user: hiker._id, type: 'approach' })).toBe(1)
  })

  it('does nothing for a user without a push subscription', async () => {
    await User.findByIdAndUpdate(hiker._id, { pushSubscriptions: [] })

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(0)
    expect(await Notification.countDocuments()).toBe(0)
  })

  it('does nothing for an unknown user', async () => {
    expect(await checkApproachAlerts(new mongoose.Types.ObjectId(), NEAR)).toBe(0)
  })

  it('does not throw when the push fails, and does not retry on the next position', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    webpush.sendNotification.mockRejectedValue(
      Object.assign(new Error('push service down'), { statusCode: 500 })
    )

    expect(await checkApproachAlerts(hiker._id, NEAR)).toBe(0)
    expect(errorSpy).toHaveBeenCalled()

    await checkApproachAlerts(hiker._id, NEAR)
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
  })
})
