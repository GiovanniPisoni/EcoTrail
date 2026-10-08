import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../src/index.js'
import User from '../../src/models/User.js'
import Trail from '../../src/models/Trail.js'
import Report from '../../src/models/Report.js'
import TrailActivity from '../../src/models/TrailActivity.js'
import TrailStatusHistory from '../../src/models/TrailStatusHistory.js'
import Notification from '../../src/models/Notification.js'

const JWT_SECRET = 'test-secret'
const DAY = '2026-10-08'
const DAY_QUERY = { from: DAY, to: DAY }

let mongod
let admin
let hiker
let trailA
let trailB

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
}

function get(path, query = DAY_QUERY, token = tokenFor(admin)) {
  return request(app).get(path).set('Authorization', `Bearer ${token}`).query(query)
}

function makeTrail(name) {
  return Trail.create({
    name,
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, 46.18],
        [10.91, 46.18]
      ]
    }
  })
}

function bucket(trail, isoHour, users) {
  return TrailActivity.create({ trail: trail._id, hour: new Date(isoHour), users })
}

function makeReport(overrides = {}) {
  return Report.create({
    author: hiker._id,
    trail: trailA._id,
    type: 'fallen_tree',
    severity: 'medium',
    location: { type: 'Point', coordinates: [10.905, 46.18] },
    createdAt: new Date('2026-10-08T09:00:00Z'),
    ...overrides
  })
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await TrailActivity.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Trail.deleteMany({}),
    Report.deleteMany({}),
    TrailActivity.deleteMany({}),
    TrailStatusHistory.deleteMany({}),
    Notification.deleteMany({})
  ])
  admin = await User.create({ email: 'admin@ecotrail.test', password: 'hashed', role: 'admin' })
  hiker = await User.create({ email: 'hiker@ecotrail.test', password: 'hashed', role: 'hiker' })
  trailA = await makeTrail('Trail A')
  trailB = await makeTrail('Trail B')
})

describe('access control', () => {
  it.each(['/api/stats/attendance', '/api/stats/heatmap', '/api/stats/events'])(
    'rejects anonymous and hiker requests on %s',
    async (path) => {
      expect((await request(app).get(path)).status).toBe(401)
      expect((await get(path, DAY_QUERY, tokenFor(hiker))).status).toBe(403)
    }
  )

  it('rejects an invalid period', async () => {
    const res = await get('/api/stats/attendance', { from: 'nope' })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/stats/attendance', () => {
  it('counts distinct hikers per trail and per hour of the day', async () => {
    const u1 = new mongoose.Types.ObjectId()
    const u2 = new mongoose.Types.ObjectId()
    await bucket(trailA, '2026-10-08T14:00:00Z', [u1, u2])
    await bucket(trailA, '2026-10-08T15:00:00Z', [u1])
    await bucket(trailB, '2026-10-08T14:00:00Z', [u2])

    const res = await get('/api/stats/attendance')

    expect(res.status).toBe(200)
    expect(res.body.trails).toEqual([
      expect.objectContaining({ name: 'Trail A', hikers: 2 }),
      expect.objectContaining({ name: 'Trail B', hikers: 1 })
    ])
    expect(res.body.byHour).toHaveLength(24)
    expect(res.body.byHour[16].hikers).toBe(3)
    expect(res.body.byHour[17].hikers).toBe(1)
    expect(res.body.byHour[0].hikers).toBe(0)
  })

  it('ignores activity outside the selected period', async () => {
    await bucket(trailA, '2026-10-06T10:00:00Z', [new mongoose.Types.ObjectId()])

    const res = await get('/api/stats/attendance')

    expect(res.body.trails).toEqual([])
  })

  it('can be restricted to a single trail', async () => {
    const user = new mongoose.Types.ObjectId()
    await bucket(trailA, '2026-10-08T14:00:00Z', [user])
    await bucket(trailB, '2026-10-08T14:00:00Z', [user])

    const res = await get('/api/stats/attendance', { ...DAY_QUERY, trail: String(trailB._id) })

    expect(res.body.trails).toHaveLength(1)
    expect(res.body.trails[0].name).toBe('Trail B')
  })

  it('rejects a malformed trail id', async () => {
    const res = await get('/api/stats/attendance', { ...DAY_QUERY, trail: 'abc' })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/stats/heatmap', () => {
  it('returns reports as weighted points', async () => {
    await makeReport({ severity: 'high' })

    const res = await get('/api/stats/heatmap')

    expect(res.status).toBe(200)
    expect(res.body.points).toEqual([[46.18, 10.905, 1]])
  })

  it('leaves out suspicious, rejected and out of period reports', async () => {
    await makeReport({ isSuspicious: true })
    await makeReport({ validationStatus: 'rejected' })
    await makeReport({ createdAt: new Date('2026-09-01T09:00:00Z') })
    await makeReport()

    const res = await get('/api/stats/heatmap')

    expect(res.body.points).toHaveLength(1)
  })
})

describe('GET /api/stats/events', () => {
  async function seedEvents() {
    const at = new Date('2026-10-08T09:00:00Z')
    await TrailStatusHistory.create([
      {
        trail: trailA._id,
        previousStatus: 'at_risk',
        newStatus: 'closed',
        reason: 'Landslide',
        changedBy: admin._id,
        changedAt: at
      },
      {
        trail: trailB._id,
        previousStatus: 'free',
        newStatus: 'at_risk',
        reason: 'Reliable reports',
        changedBy: null,
        changedAt: new Date('2026-10-08T10:00:00Z')
      },
      {
        trail: trailB._id,
        previousStatus: 'at_risk',
        newStatus: 'free',
        reason: 'Back to normal',
        changedBy: admin._id,
        changedAt: new Date('2026-10-08T11:00:00Z')
      }
    ])
    await Notification.create(
      [1, 2, 3].map(() => ({
        user: new mongoose.Types.ObjectId(),
        type: 'emergency',
        trail: trailA._id,
        title: 'Trail closed',
        body: 'Trail A is closed',
        sentAt: new Date('2026-10-08T09:30:10Z')
      }))
    )
  }

  it('returns totals and a single timeline, newest first', async () => {
    await seedEvents()

    const res = await get('/api/stats/events')

    expect(res.status).toBe(200)
    expect(res.body.totals).toEqual({ closures: 1, alerts: 1, notifications: 3 })
    expect(res.body.events.map((event) => event.kind)).toEqual(['alert', 'notification', 'closure'])
    expect(res.body.events[1].count).toBe(3)
    expect(res.body.events[1].detail).toBe('Trail A is closed')
    expect(res.body.notificationRetentionDays).toBe(30)
  })

  it('counts a person once per group even when they got several notifications', async () => {
    const user = new mongoose.Types.ObjectId()
    const sentAt = new Date('2026-10-08T09:30:10Z')
    await Notification.create([
      { user, type: 'emergency', trail: trailA._id, title: 'Closed', body: 'Closed', sentAt },
      { user, type: 'emergency', trail: trailA._id, title: 'Report', body: 'Report', sentAt },
      {
        user: new mongoose.Types.ObjectId(),
        type: 'emergency',
        trail: trailA._id,
        title: 'Closed',
        body: 'Closed',
        sentAt
      }
    ])

    const res = await get('/api/stats/events')

    expect(res.body.totals.notifications).toBe(3)
    expect(res.body.events).toHaveLength(1)
    expect(res.body.events[0].count).toBe(2)
  })

  it('filters the timeline by event type but keeps all totals', async () => {
    await seedEvents()

    const res = await get('/api/stats/events', { ...DAY_QUERY, type: 'closure' })

    expect(res.body.events).toHaveLength(1)
    expect(res.body.events[0].trail.name).toBe('Trail A')
    expect(res.body.totals).toEqual({ closures: 1, alerts: 1, notifications: 3 })
  })

  it('rejects an unknown event type', async () => {
    const res = await get('/api/stats/events', { ...DAY_QUERY, type: 'other' })

    expect(res.status).toBe(400)
  })
})
