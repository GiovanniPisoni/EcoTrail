import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/index.js'
import User from '../src/models/User.js'
import Trail from '../src/models/Trail.js'
import Report from '../src/models/Report.js'
import ReputationChange from '../src/models/ReputationChange.js'
import {
  RATE_LIMIT_MAX_REPORTS,
  RATE_LIMIT_WINDOW_MS,
  SPAM_REPUTATION_PENALTY
} from '../src/services/reportSpam.js'

const JWT_SECRET = 'test-secret'
const BBOX = '10,46,11,47'

let mongod
let trail
let admin
let userCounter = 0

const reportBody = {
  type: 'fallen_tree',
  severity: 'medium',
  description: 'Pine across the path',
  latitude: 46.18,
  longitude: 10.905
}

async function createUser(role = 'hiker', reputation = 0) {
  userCounter += 1
  const user = await User.create({
    email: `user${userCounter}@ecotrail.test`,
    password: 'hashed',
    role,
    reputation
  })
  const token = jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' })
  return { user, token }
}

function postReport(token, body = reportBody) {
  return request(app).post('/api/reports').set('Authorization', `Bearer ${token}`).send(body)
}

async function sendReport(token, body = reportBody) {
  const res = await postReport(token, body)
  expect(res.status).toBe(201)
  return res.body.id
}

function insertReport(author, overrides = {}) {
  return Report.create({
    author: author._id,
    trail: trail._id,
    type: 'fallen_tree',
    severity: 'medium',
    location: { type: 'Point', coordinates: [10.905, 46.18] },
    ...overrides
  })
}

function review(id, body) {
  return request(app)
    .patch(`/api/reports/${id}/validate`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send(body)
}

function adminList(query) {
  return request(app)
    .get('/api/reports/admin')
    .set('Authorization', `Bearer ${admin.token}`)
    .query(query)
}

async function suspiciousFlags(ids) {
  return Promise.all(ids.map(async (id) => (await Report.findById(id)).isSuspicious))
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
  await Promise.all([
    User.deleteMany({}),
    Trail.deleteMany({}),
    Report.deleteMany({}),
    ReputationChange.deleteMany({})
  ])
  trail = await Trail.create({
    name: 'Test trail',
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, 46.18],
        [10.91, 46.18]
      ]
    }
  })
  admin = await createUser('admin')
})

describe('suspicious reports', () => {
  it('keeps the first of five identical reports normal and marks the others as suspicious', async () => {
    const { token } = await createUser()
    const ids = []
    for (let i = 0; i < 5; i++) ids.push(await sendReport(token))

    expect(await suspiciousFlags(ids)).toEqual([false, true, true, true, true])
  })

  it('does not publish suspicious reports on the public map', async () => {
    const { token } = await createUser()
    const first = await sendReport(token)
    const second = await sendReport(token)
    await review(first, { status: 'validated' })

    const res = await request(app).get('/api/reports').query({ bbox: BBOX })

    expect(res.body.features.map((feature) => feature.properties.id)).toEqual([first])
    expect(await suspiciousFlags([second])).toEqual([true])
  })

  it('does not mark a report of another type', async () => {
    const { token } = await createUser()
    await sendReport(token)
    const other = await sendReport(token, { ...reportBody, type: 'landslide' })

    expect(await suspiciousFlags([other])).toEqual([false])
  })

  it('does not mark a report sent from a different spot', async () => {
    const { token } = await createUser()
    await sendReport(token)
    const farAway = await sendReport(token, { ...reportBody, longitude: 10.906 })

    expect(await suspiciousFlags([farAway])).toEqual([false])
  })

  it('does not mark a report when the previous one is older than the time window', async () => {
    const { user, token } = await createUser()
    await insertReport(user, { createdAt: new Date(Date.now() - 2 * 60 * 1000) })

    const id = await sendReport(token)

    expect(await suspiciousFlags([id])).toEqual([false])
  })

  it('does not mark reports of different users on the same spot', async () => {
    const ids = []
    for (let i = 0; i < 3; i++) ids.push(await sendReport((await createUser()).token))

    expect(await suspiciousFlags(ids)).toEqual([false, false, false])
  })

  it('does not raise the trust score of the author with the suspicious ones', async () => {
    const { token } = await createUser()
    const ids = []
    for (let i = 0; i < 3; i++) ids.push(await sendReport(token))

    const scores = (await Report.find({ _id: { $in: ids } })).map((report) => report.trustScore)

    expect(scores).toEqual([1, 1, 1])
  })
})

describe('report rate limit', () => {
  async function fillLimit(user, createdAt = new Date()) {
    for (let i = 0; i < RATE_LIMIT_MAX_REPORTS; i++) {
      await insertReport(user, {
        createdAt,
        location: { type: 'Point', coordinates: [10.9 + i / 10000, 46.18] }
      })
    }
  }

  it('refuses a new report once the limit is reached', async () => {
    const { user, token } = await createUser()
    await fillLimit(user)

    const res = await postReport(token)

    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/too many reports/i)
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_MS / 1000)
    expect(await Report.countDocuments({ author: user._id })).toBe(RATE_LIMIT_MAX_REPORTS)
  })

  it('accepts reports up to the limit', async () => {
    const { user, token } = await createUser()
    for (let i = 0; i < RATE_LIMIT_MAX_REPORTS - 1; i++) {
      await insertReport(user, {
        location: { type: 'Point', coordinates: [10.9 + i / 10000, 46.18] }
      })
    }

    const res = await postReport(token)

    expect(res.status).toBe(201)
  })

  it('does not count reports older than the time window', async () => {
    const { user, token } = await createUser()
    await fillLimit(user, new Date(Date.now() - RATE_LIMIT_WINDOW_MS - 60 * 1000))

    const res = await postReport(token)

    expect(res.status).toBe(201)
  })

  it('counts withdrawn reports too', async () => {
    const { user, token } = await createUser()
    for (let i = 0; i < RATE_LIMIT_MAX_REPORTS; i++) {
      await insertReport(user, {
        validationStatus: 'withdrawn',
        location: { type: 'Point', coordinates: [10.9 + i / 10000, 46.18] }
      })
    }

    const res = await postReport(token)

    expect(res.status).toBe(429)
  })

  it('applies to each user separately', async () => {
    const { user } = await createUser()
    await fillLimit(user)
    const { token: otherToken } = await createUser()

    const res = await postReport(otherToken)

    expect(res.status).toBe(201)
  })

  it('still requires authentication', async () => {
    const res = await request(app).post('/api/reports').send(reportBody)

    expect(res.status).toBe(401)
  })
})

describe('suspicious filter in the admin API', () => {
  it('lists only suspicious reports with suspicious=true', async () => {
    const { user } = await createUser()
    const normal = await insertReport(user)
    const suspicious = await insertReport(user, { isSuspicious: true })

    const res = await adminList({ suspicious: 'true' })

    expect(res.status).toBe(200)
    expect(res.body.reports.map((report) => report.id)).toEqual([String(suspicious._id)])
    expect(res.body.reports[0].isSuspicious).toBe(true)
    expect(String(normal._id)).not.toBe(String(suspicious._id))
  })

  it('leaves them out with suspicious=false', async () => {
    const { user } = await createUser()
    const normal = await insertReport(user)
    await insertReport(user, { isSuspicious: true })

    const res = await adminList({ suspicious: 'false' })

    expect(res.body.reports.map((report) => report.id)).toEqual([String(normal._id)])
  })

  it('combines with the validation status', async () => {
    const { user } = await createUser()
    await insertReport(user, { isSuspicious: true, validationStatus: 'rejected' })
    const pending = await insertReport(user, { isSuspicious: true })

    const res = await adminList({ suspicious: 'true', validationStatus: 'pending' })

    expect(res.body.reports.map((report) => report.id)).toEqual([String(pending._id)])
  })

  it('rejects a wrong value', async () => {
    const res = await adminList({ suspicious: 'maybe' })

    expect(res.status).toBe(400)
  })

  it('is closed to hikers', async () => {
    const { token } = await createUser()

    const res = await request(app)
      .get('/api/reports/admin')
      .set('Authorization', `Bearer ${token}`)
      .query({ suspicious: 'true' })

    expect(res.status).toBe(403)
  })
})

describe('review of a suspicious report', () => {
  it('validating it clears the flag and publishes it', async () => {
    const { token } = await createUser()
    await sendReport(token)
    const id = await sendReport(token)

    const res = await review(id, { status: 'validated' })

    expect(res.status).toBe(200)
    expect(res.body.isSuspicious).toBe(false)
    const publicRes = await request(app).get('/api/reports').query({ bbox: BBOX })
    expect(publicRes.body.features.map((feature) => feature.properties.id)).toEqual([id])
  })

  it('rejecting it without spam clears the flag and does not touch the reputation', async () => {
    const { user, token } = await createUser('hiker', 5)
    await sendReport(token)
    const id = await sendReport(token)

    const res = await review(id, { status: 'rejected' })

    expect(res.body.isSuspicious).toBe(false)
    expect(res.body.markedAsSpam).toBe(false)
    expect((await User.findById(user._id)).reputation).toBe(5)
    expect(await ReputationChange.countDocuments()).toBe(0)
  })
})

describe('reputation penalty for spam', () => {
  async function suspiciousFrom(user) {
    return insertReport(user, { isSuspicious: true })
  }

  it('is applied when the admin rejects a report as spam, with the reason recorded', async () => {
    const { user } = await createUser('hiker', 5)
    const report = await suspiciousFrom(user)

    const res = await review(report._id, { status: 'rejected', spam: true })

    expect(res.status).toBe(200)
    expect(res.body.markedAsSpam).toBe(true)
    expect((await User.findById(user._id)).reputation).toBe(5 - SPAM_REPUTATION_PENALTY)
    const [change] = await ReputationChange.find()
    expect(change.user.equals(user._id)).toBe(true)
    expect(change.delta).toBe(-SPAM_REPUTATION_PENALTY)
    expect(change.reason).toBe('spam')
    expect(change.report.equals(report._id)).toBe(true)
  })

  it('is not applied twice to the same report', async () => {
    const { user } = await createUser('hiker', 5)
    const report = await suspiciousFrom(user)

    await review(report._id, { status: 'rejected', spam: true })
    await review(report._id, { status: 'rejected', spam: true })

    expect((await User.findById(user._id)).reputation).toBe(5 - SPAM_REPUTATION_PENALTY)
    expect(await ReputationChange.countDocuments()).toBe(1)
  })

  it('never takes the reputation below zero and remembers what was really removed', async () => {
    const { user } = await createUser('hiker', 1)
    const report = await suspiciousFrom(user)

    await review(report._id, { status: 'rejected', spam: true })

    expect((await User.findById(user._id)).reputation).toBe(0)
    expect((await ReputationChange.findOne()).delta).toBe(-1)
    expect((await Report.findById(report._id)).spamPenalty).toBe(1)
  })

  it('does nothing and records nothing when the author has no reputation', async () => {
    const { user } = await createUser('hiker', 0)
    const report = await suspiciousFrom(user)

    await review(report._id, { status: 'rejected', spam: true })

    expect(await ReputationChange.countDocuments()).toBe(0)
  })

  it('is given back when the admin changes their mind', async () => {
    const { user } = await createUser('hiker', 5)
    const report = await suspiciousFrom(user)
    await review(report._id, { status: 'rejected', spam: true })

    const res = await review(report._id, { status: 'validated' })

    expect(res.body.markedAsSpam).toBe(false)
    // +2 given back, +1 for the validated report
    expect((await User.findById(user._id)).reputation).toBe(5 + 1)
    const reasons = (await ReputationChange.find().sort({ _id: 1 })).map((c) => c.reason)
    expect(reasons).toEqual(['spam', 'spam_reverted', 'report_validated'])
  })

  it('only applies when rejecting', async () => {
    const { user } = await createUser('hiker', 5)
    const report = await suspiciousFrom(user)

    const res = await review(report._id, { status: 'validated', spam: true })

    expect(res.status).toBe(400)
    expect((await User.findById(user._id)).reputation).toBe(5)
  })

  it('needs a boolean value', async () => {
    const { user } = await createUser('hiker', 5)
    const report = await suspiciousFrom(user)

    const res = await review(report._id, { status: 'rejected', spam: 'yes' })

    expect(res.status).toBe(400)
  })

  it('records the reason of the other reputation changes too', async () => {
    const { user } = await createUser('hiker', 0)
    const report = await insertReport(user)

    await review(report._id, { status: 'validated' })
    await review(report._id, { status: 'rejected' })

    const changes = await ReputationChange.find().sort({ _id: 1 })
    expect(changes.map((c) => [c.reason, c.delta])).toEqual([
      ['report_validated', 1],
      ['validation_revoked', -1]
    ])
  })
})
