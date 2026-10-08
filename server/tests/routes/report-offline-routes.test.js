import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../src/index.js'
import User from '../../src/models/User.js'
import Trail from '../../src/models/Trail.js'
import Report from '../../src/models/Report.js'
import { RATE_LIMIT_MAX_REPORTS } from '../../src/services/reports/reportSpam.js'
import { MAX_CAPTURE_AGE_MS } from '../../src/services/reports/reportCapture.js'

const JWT_SECRET = 'test-secret'
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

let mongod
let userCounter = 0

const validBody = {
  type: 'fallen_tree',
  severity: 'medium',
  latitude: 46.1805,
  longitude: 10.905
}

async function createUser() {
  userCounter += 1
  const user = await User.create({
    email: `user${userCounter}@ecotrail.test`,
    password: 'hashed',
    role: 'hiker'
  })
  const token = jwt.sign({ id: user._id, role: 'hiker' }, JWT_SECRET, { expiresIn: '7d' })
  return { user, token }
}

function postReport(token, body = {}, key) {
  const req = request(app)
    .post('/api/reports')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...validBody, ...body })
  return key ? req.set('Idempotency-Key', key) : req
}

function ago(ms) {
  return new Date(Date.now() - ms).toISOString()
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Trail.init()
  await Report.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Trail.deleteMany({}), Report.deleteMany({})])
  await Trail.create({
    name: 'Test trail',
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, 46.18],
        [10.91, 46.18]
      ]
    }
  })
})

describe('the time a report was written', () => {
  it('uses the time of capture sent by the client', async () => {
    const { token } = await createUser()
    const capturedAt = ago(2 * HOUR_MS)

    const res = await postReport(token, { capturedAt })

    expect(res.status).toBe(201)
    expect(new Date(res.body.createdAt).toISOString()).toBe(capturedAt)
    expect((await Report.findById(res.body.id)).createdAt.toISOString()).toBe(capturedAt)
  })

  it('uses the time of receipt when none is sent', async () => {
    const { token } = await createUser()
    const before = Date.now()

    const res = await postReport(token)

    expect(new Date(res.body.createdAt).getTime()).toBeGreaterThanOrEqual(before)
  })

  it('does not accept a time in the future', async () => {
    const { token } = await createUser()
    const before = Date.now()

    const res = await postReport(token, {
      capturedAt: new Date(before + 3 * HOUR_MS).toISOString()
    })

    expect(res.status).toBe(201)
    expect(new Date(res.body.createdAt).getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('does not accept a time older than 24 hours', async () => {
    const { token } = await createUser()

    const res = await postReport(token, { capturedAt: ago(5 * MAX_CAPTURE_AGE_MS) })

    expect(res.status).toBe(201)
    const age = Date.now() - new Date(res.body.createdAt).getTime()
    expect(age).toBeLessThan(MAX_CAPTURE_AGE_MS + MINUTE_MS)
    expect(age).toBeGreaterThanOrEqual(MAX_CAPTURE_AGE_MS)
  })

  it('returns 400 for a time that is not a date, saving nothing', async () => {
    const { token } = await createUser()

    const res = await postReport(token, { capturedAt: 'yesterday' })

    expect(res.status).toBe(400)
    expect(res.body.details.capturedAt).toBeDefined()
    expect(await Report.countDocuments()).toBe(0)
  })
})

describe('sending the same report twice', () => {
  const KEY = '3f2b8c1e-5a47-4d0e-9c1a-7b6e2d9f0a11'

  it('saves it once and returns the saved report the second time', async () => {
    const { token } = await createUser()

    const first = await postReport(token, {}, KEY)
    const second = await postReport(token, {}, KEY)

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body.id).toBe(first.body.id)
    expect(await Report.countDocuments()).toBe(1)
  })

  it('treats two users with the same key as different reports', async () => {
    const first = await createUser()
    const second = await createUser()

    await postReport(first.token, {}, KEY)
    const res = await postReport(second.token, {}, KEY)

    expect(res.status).toBe(201)
    expect(await Report.countDocuments()).toBe(2)
  })

  it('saves it once when both requests arrive at the same time', async () => {
    const { token } = await createUser()

    const responses = await Promise.all([postReport(token, {}, KEY), postReport(token, {}, KEY)])

    expect(responses.map((res) => res.status).sort()).toEqual([200, 201])
    expect(await Report.countDocuments()).toBe(1)
  })

  it('answers a retry even when the user is over the rate limit', async () => {
    const { user, token } = await createUser()
    await postReport(token, { type: 'landslide' }, KEY)
    await Report.create(
      Array.from({ length: RATE_LIMIT_MAX_REPORTS }, () => ({
        author: user._id,
        type: 'flooding',
        severity: 'low',
        trail: new mongoose.Types.ObjectId(),
        location: { type: 'Point', coordinates: [10.905, 46.1805] }
      }))
    )
    expect((await postReport(token, { type: 'other' })).status).toBe(429)

    const retry = await postReport(token, { type: 'landslide' }, KEY)

    expect(retry.status).toBe(200)
  })

  it('returns 400 for a key that is not valid', async () => {
    const { token } = await createUser()

    const res = await postReport(token, {}, 'not a valid key!')

    expect(res.status).toBe(400)
    expect(await Report.countDocuments()).toBe(0)
  })

  it('works as before when no key is sent', async () => {
    const { token } = await createUser()

    const res = await postReport(token)

    expect(res.status).toBe(201)
    expect((await Report.findById(res.body.id)).clientId).toBeUndefined()
  })
})

describe('reports written offline and sent together', () => {
  it('are not suspicious when they were written minutes apart', async () => {
    const { token } = await createUser()

    const first = await postReport(token, { capturedAt: ago(30 * MINUTE_MS) })
    const second = await postReport(token, { capturedAt: ago(20 * MINUTE_MS) })

    expect((await Report.findById(first.body.id)).isSuspicious).toBe(false)
    expect((await Report.findById(second.body.id)).isSuspicious).toBe(false)
  })

  it('are still suspicious when they were written seconds apart', async () => {
    const { token } = await createUser()
    const base = Date.now() - 30 * MINUTE_MS

    const first = await postReport(token, { capturedAt: new Date(base).toISOString() })
    const second = await postReport(token, { capturedAt: new Date(base + 20 * 1000).toISOString() })

    expect((await Report.findById(first.body.id)).isSuspicious).toBe(false)
    expect((await Report.findById(second.body.id)).isSuspicious).toBe(true)
  })

  it('are not confirmed by a report that was written hours earlier', async () => {
    const first = await createUser()
    const second = await createUser()

    const recent = await postReport(first.token)
    const old = await postReport(second.token, { capturedAt: ago(3 * HOUR_MS) })

    expect((await Report.findById(recent.body.id)).trustScore).toBe(1)
    expect((await Report.findById(old.body.id)).trustScore).toBe(1)
  })

  it('are confirmed by a report that was written within the window', async () => {
    const first = await createUser()
    const second = await createUser()

    const recent = await postReport(first.token)
    const earlier = await postReport(second.token, { capturedAt: ago(30 * MINUTE_MS) })

    expect((await Report.findById(recent.body.id)).trustScore).toBe(2)
    expect((await Report.findById(earlier.body.id)).trustScore).toBe(2)
  })
})
