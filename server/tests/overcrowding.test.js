import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
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
import TrailStatusHistory from '../src/models/TrailStatusHistory.js'
import User from '../src/models/User.js'
import UserPresence from '../src/models/UserPresence.js'
import Notification from '../src/models/Notification.js'
import { saveUserPosition } from '../src/services/userPresence.js'
import { trailEvents, TRAIL_STATUS_CHANGED } from '../src/services/trailEvents.js'
import {
  checkOvercrowdingNear,
  checkTrailOvercrowding,
  defaultCrowdThreshold,
  defaultReleaseThreshold,
  findAlternativeTrail,
  getCrowdThresholds,
  sweepCrowdedTrails,
  FALLBACK_CROWD_THRESHOLD,
  GLOBAL_COOLDOWN_MS,
  TRAIL_COOLDOWN_MS
} from '../src/services/overcrowding.js'

let mongod

const SUBSCRIPTION = { endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } }

beforeAll(async () => {
  process.env.VAPID_SUBJECT = 'mailto:test@ecotrail.test'
  process.env.VAPID_PUBLIC_KEY = 'test-public-key'
  process.env.VAPID_PRIVATE_KEY = 'test-private-key'

  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Promise.all([Trail.init(), UserPresence.init()])
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  vi.clearAllMocks()
  webpush.sendNotification.mockResolvedValue()
  await Promise.all([
    Trail.deleteMany({}),
    TrailStatusHistory.deleteMany({}),
    User.deleteMany({}),
    UserPresence.deleteMany({}),
    Notification.deleteMany({})
  ])
})

afterEach(() => {
  vi.restoreAllMocks()
})

function trailAt(name, latitude, extra = {}) {
  return Trail.create({
    name,
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, latitude],
        [10.91, latitude]
      ]
    },
    distanceKm: 1,
    ...extra
  })
}

let userCounter = 0

async function addHiker(latitude, longitude, userFields = {}) {
  userCounter += 1
  const user = await User.create({
    email: `hiker${userCounter}@ecotrail.test`,
    password: 'hashed',
    pushSubscriptions: [SUBSCRIPTION],
    ...userFields
  })
  await saveUserPosition(user._id, { latitude, longitude })
  return user
}

async function addHikersOnTrail(count, latitude = 46.18) {
  const users = []
  for (let i = 0; i < count; i++) {
    users.push(await addHiker(latitude, 10.9 + i * 0.0001))
  }
  return users
}

describe('crowd thresholds', () => {
  it('scales the default threshold with the trail length', () => {
    expect(defaultCrowdThreshold({ distanceKm: 5 })).toBe(20)
  })

  it('keeps the default threshold within the allowed bounds', () => {
    expect(defaultCrowdThreshold({ distanceKm: 0.5 })).toBe(3)
    expect(defaultCrowdThreshold({ distanceKm: 25 })).toBe(40)
  })

  it('falls back to a fixed threshold when the length is unknown', () => {
    expect(defaultCrowdThreshold({})).toBe(FALLBACK_CROWD_THRESHOLD)
    expect(getCrowdThresholds({})).toEqual({ enter: 10, release: 7 })
  })

  it('derives the release threshold from the alert threshold', () => {
    expect(defaultReleaseThreshold(20)).toBe(14)
    expect(defaultReleaseThreshold(3)).toBe(2)
    expect(defaultReleaseThreshold(2)).toBe(1)
  })

  it('prefers the values set by an admin', () => {
    expect(
      getCrowdThresholds({ distanceKm: 5, crowdThreshold: 6, crowdReleaseThreshold: 2 })
    ).toEqual({ enter: 6, release: 2 })
  })

  it('never lets the release threshold reach the alert threshold', () => {
    expect(getCrowdThresholds({ crowdThreshold: 4, crowdReleaseThreshold: 9 })).toEqual({
      enter: 4,
      release: 3
    })
  })
})

describe('checkTrailOvercrowding', () => {
  it('returns unchanged for an unknown trail', async () => {
    const result = await checkTrailOvercrowding(new mongoose.Types.ObjectId())

    expect(result).toEqual({ changed: false })
  })

  it('does nothing below the threshold', async () => {
    const trail = await trailAt('Trail', 46.18)
    await addHikersOnTrail(3)

    const result = await checkTrailOvercrowding(trail._id)

    expect(result).toMatchObject({ changed: false, count: 3 })
    expect((await Trail.findById(trail._id)).status).toBe('free')
    expect(await TrailStatusHistory.countDocuments()).toBe(0)
  })

  it('marks the trail as crowded when the threshold is reached', async () => {
    const trail = await trailAt('Trail', 46.18)
    await addHikersOnTrail(4)

    const result = await checkTrailOvercrowding(trail._id)

    expect(result).toEqual({ changed: true, status: 'crowded', count: 4 })
    expect((await Trail.findById(trail._id)).status).toBe('crowded')
  })

  it('records an automatic history entry without an author', async () => {
    const trail = await trailAt('Trail', 46.18)
    await addHikersOnTrail(4)

    await checkTrailOvercrowding(trail._id)

    const [entry] = await TrailStatusHistory.find({ trail: trail._id })
    expect(entry.previousStatus).toBe('free')
    expect(entry.newStatus).toBe('crowded')
    expect(entry.changedBy).toBeNull()
    expect(entry.reason).toContain('Automatic')
  })

  it('emits the status change event', async () => {
    const trail = await trailAt('Trail', 46.18)
    await addHikersOnTrail(4)
    const listener = vi.fn()
    trailEvents.on(TRAIL_STATUS_CHANGED, listener)
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await checkTrailOvercrowding(trail._id)
    trailEvents.off(TRAIL_STATUS_CHANGED, listener)

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: 'crowded', previousStatus: 'free', changedBy: null })
    )
  })

  it('uses the threshold set by an admin', async () => {
    const trail = await trailAt('Trail', 46.18, { crowdThreshold: 2, crowdReleaseThreshold: 1 })
    await addHikersOnTrail(2)

    const result = await checkTrailOvercrowding(trail._id)

    expect(result.status).toBe('crowded')
  })

  it('does not count users who are far from the trail', async () => {
    const trail = await trailAt('Trail', 46.18)
    await addHikersOnTrail(3)
    await addHiker(46.19, 10.905)

    const result = await checkTrailOvercrowding(trail._id)

    expect(result).toMatchObject({ changed: false, count: 3 })
  })

  it.each(['at_risk', 'closed'])('leaves a %s trail untouched', async (status) => {
    const trail = await trailAt('Trail', 46.18, { status })
    await addHikersOnTrail(6)

    const result = await checkTrailOvercrowding(trail._id)

    expect(result.changed).toBe(false)
    expect((await Trail.findById(trail._id)).status).toBe(status)
  })

  it('stays crowded while the count is between the two thresholds', async () => {
    const trail = await trailAt('Trail', 46.18, { status: 'crowded' })
    await addHikersOnTrail(4)

    const result = await checkTrailOvercrowding(trail._id)

    expect(result).toMatchObject({ changed: false, count: 4 })
    expect((await Trail.findById(trail._id)).status).toBe('crowded')
  })

  it('goes back to free when the count drops to the release threshold', async () => {
    const trail = await trailAt('Trail', 46.18, { status: 'crowded' })
    await addHikersOnTrail(3)

    const result = await checkTrailOvercrowding(trail._id)

    expect(result).toEqual({ changed: true, status: 'free', count: 3 })
    const [entry] = await TrailStatusHistory.find({ trail: trail._id })
    expect(entry.newStatus).toBe('free')
    expect(entry.changedBy).toBeNull()
  })

  it('ignores positions that are no longer active', async () => {
    const trail = await trailAt('Trail', 46.18)
    await addHikersOnTrail(4)
    const later = new Date(Date.now() + 20 * 60 * 1000)

    const result = await checkTrailOvercrowding(trail._id, { now: later })

    expect(result).toMatchObject({ changed: false, count: 0 })
  })

  it('does not apply the same change twice', async () => {
    const trail = await trailAt('Trail', 46.18)
    await addHikersOnTrail(4)

    const results = await Promise.all([
      checkTrailOvercrowding(trail._id),
      checkTrailOvercrowding(trail._id)
    ])

    expect(results.filter((result) => result.changed)).toHaveLength(1)
    expect(await TrailStatusHistory.countDocuments()).toBe(1)
  })
})

describe('checkOvercrowdingNear', () => {
  it('checks the trail closest to the position', async () => {
    const trail = await trailAt('Trail', 46.18)
    await addHikersOnTrail(4)

    const result = await checkOvercrowdingNear(46.18, 10.905)

    expect(result.status).toBe('crowded')
    expect((await Trail.findById(trail._id)).status).toBe('crowded')
  })

  it('does nothing when no trail is close to the position', async () => {
    await trailAt('Trail', 46.18)

    const result = await checkOvercrowdingNear(46.5, 11.5)

    expect(result).toEqual({ changed: false })
  })
})

describe('sweepCrowdedTrails', () => {
  it('releases a crowded trail that is now empty', async () => {
    const trail = await trailAt('Trail', 46.18, { status: 'crowded' })

    await sweepCrowdedTrails()

    expect((await Trail.findById(trail._id)).status).toBe('free')
  })

  it('keeps a trail crowded while it is still busy', async () => {
    const trail = await trailAt('Trail', 46.18, { status: 'crowded' })
    await addHikersOnTrail(5)

    await sweepCrowdedTrails()

    expect((await Trail.findById(trail._id)).status).toBe('crowded')
  })
})

describe('findAlternativeTrail', () => {
  it('returns the closest free trail', async () => {
    const crowded = await trailAt('Crowded', 46.18, { status: 'crowded' })
    await trailAt('Far', 46.2)
    const near = await trailAt('Near', 46.185)

    const alternative = await findAlternativeTrail(crowded.toObject())

    expect(alternative._id.equals(near._id)).toBe(true)
  })

  it('skips trails that are not free', async () => {
    const crowded = await trailAt('Crowded', 46.18, { status: 'crowded' })
    await trailAt('Closed', 46.185, { status: 'closed' })
    await trailAt('At risk', 46.186, { status: 'at_risk' })

    expect(await findAlternativeTrail(crowded.toObject())).toBeNull()
  })

  it('ignores free trails that are too far away', async () => {
    const crowded = await trailAt('Crowded', 46.18, { status: 'crowded' })
    await trailAt('Distant', 46.4)

    expect(await findAlternativeTrail(crowded.toObject())).toBeNull()
  })
})

describe('overcrowding notifications', () => {
  it('tells hikers on the trail about the closest free alternative', async () => {
    await trailAt('Quiet', 46.185)
    const trail = await trailAt('Busy', 46.18)
    const hikers = await addHikersOnTrail(4)

    await checkTrailOvercrowding(trail._id)

    expect(webpush.sendNotification).toHaveBeenCalledTimes(4)
    const quiet = await Trail.findOne({ name: 'Quiet' })
    const sent = await Notification.find({ user: hikers[0]._id })
    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('overcrowd')
    expect(sent[0].trail.equals(trail._id)).toBe(true)
    expect(sent[0].body).toContain('Quiet')
    expect(sent[0].url).toBe(`/?trail=${quiet._id}`)
  })

  it('points to the crowded trail when there is no free alternative', async () => {
    const trail = await trailAt('Busy', 46.18)
    const hikers = await addHikersOnTrail(4)

    await checkTrailOvercrowding(trail._id)

    const [sent] = await Notification.find({ user: hikers[0]._id })
    expect(sent.url).toBe(`/?trail=${trail._id}`)
  })

  it('sends a shorter notice to users nearby but not on the trail', async () => {
    const trail = await trailAt('Busy', 46.18)
    await addHikersOnTrail(4)
    const nearby = await addHiker(46.1854, 10.905)

    await checkTrailOvercrowding(trail._id)

    const [sent] = await Notification.find({ user: nearby._id })
    expect(sent.title).toBe('Trail getting crowded')
    expect(sent.url).toBe(`/?trail=${trail._id}`)
  })

  it('skips users whose own radius does not reach the trail', async () => {
    const trail = await trailAt('Busy', 46.18)
    await addHikersOnTrail(4)
    const nearby = await addHiker(46.1854, 10.905, {
      notificationPreferences: { radiusMeters: 300 }
    })

    await checkTrailOvercrowding(trail._id)

    expect(await Notification.countDocuments({ user: nearby._id })).toBe(0)
  })

  it('skips users who turned overcrowding alerts off', async () => {
    const trail = await trailAt('Busy', 46.18)
    await addHikersOnTrail(4)
    const muted = await addHiker(46.18, 10.9005, {
      notificationPreferences: { alertTypes: ['emergency'] }
    })

    await checkTrailOvercrowding(trail._id)

    expect(await Notification.countDocuments({ user: muted._id })).toBe(0)
  })

  it('does not send anything when the trail does not become crowded', async () => {
    const trail = await trailAt('Quiet', 46.18)
    await addHikersOnTrail(3)

    await checkTrailOvercrowding(trail._id)

    expect(webpush.sendNotification).not.toHaveBeenCalled()
    expect(await Notification.countDocuments()).toBe(0)
  })

  it('does not notify again when the same trail gets crowded within the cooldown', async () => {
    const trail = await trailAt('Busy', 46.18)
    const hikers = await addHikersOnTrail(4)
    await Notification.create({
      user: hikers[0]._id,
      type: 'overcrowd',
      trail: trail._id,
      title: 'Crowded trail',
      sentAt: new Date(Date.now() - TRAIL_COOLDOWN_MS + 5 * 60 * 1000)
    })

    await checkTrailOvercrowding(trail._id)

    expect(await Notification.countDocuments({ user: hikers[0]._id })).toBe(1)
    expect(await Notification.countDocuments({ user: hikers[1]._id })).toBe(1)
  })

  it('notifies again once the trail cooldown has passed', async () => {
    const trail = await trailAt('Busy', 46.18)
    const hikers = await addHikersOnTrail(4)
    await Notification.create({
      user: hikers[0]._id,
      type: 'overcrowd',
      trail: trail._id,
      title: 'Crowded trail',
      sentAt: new Date(Date.now() - TRAIL_COOLDOWN_MS - 60 * 1000)
    })

    await checkTrailOvercrowding(trail._id)

    expect(await Notification.countDocuments({ user: hikers[0]._id })).toBe(2)
  })

  it('limits users to one overcrowding alert per half hour across trails', async () => {
    const trail = await trailAt('Busy', 46.18)
    const otherTrail = await trailAt('Other', 46.3)
    const hikers = await addHikersOnTrail(4)
    await Notification.create({
      user: hikers[0]._id,
      type: 'overcrowd',
      trail: otherTrail._id,
      title: 'Crowded trail',
      sentAt: new Date(Date.now() - GLOBAL_COOLDOWN_MS + 60 * 1000)
    })

    await checkTrailOvercrowding(trail._id)

    expect(await Notification.countDocuments({ user: hikers[0]._id })).toBe(1)
    expect(await Notification.countDocuments({ user: hikers[1]._id })).toBe(1)
  })

  it('allows an alert for a different trail after the global cooldown', async () => {
    const trail = await trailAt('Busy', 46.18)
    const otherTrail = await trailAt('Other', 46.3)
    const hikers = await addHikersOnTrail(4)
    await Notification.create({
      user: hikers[0]._id,
      type: 'overcrowd',
      trail: otherTrail._id,
      title: 'Crowded trail',
      sentAt: new Date(Date.now() - GLOBAL_COOLDOWN_MS - 60 * 1000)
    })

    await checkTrailOvercrowding(trail._id)

    expect(await Notification.countDocuments({ user: hikers[0]._id })).toBe(2)
  })

  it('ignores other kinds of notifications when applying the cooldown', async () => {
    const trail = await trailAt('Busy', 46.18)
    const hikers = await addHikersOnTrail(4)
    await Notification.create({
      user: hikers[0]._id,
      type: 'emergency',
      trail: trail._id,
      title: 'Emergency',
      sentAt: new Date()
    })

    await checkTrailOvercrowding(trail._id)

    expect(await Notification.countDocuments({ user: hikers[0]._id, type: 'overcrowd' })).toBe(1)
  })

  it('keeps notifying the others when one push fails', async () => {
    const trail = await trailAt('Busy', 46.18)
    await addHikersOnTrail(4)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    webpush.sendNotification.mockRejectedValueOnce(
      Object.assign(new Error('Boom'), { statusCode: 500 })
    )

    const result = await checkTrailOvercrowding(trail._id)

    expect(result.status).toBe('crowded')
    expect(webpush.sendNotification).toHaveBeenCalledTimes(4)
  })
})
