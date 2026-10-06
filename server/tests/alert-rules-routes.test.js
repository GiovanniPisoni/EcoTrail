import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/index.js'
import User from '../src/models/User.js'
import Trail from '../src/models/Trail.js'
import Report from '../src/models/Report.js'
import TrailStatusHistory from '../src/models/TrailStatusHistory.js'

const JWT_SECRET = 'test-secret'

let mongod
let trail
let admin
let userCounter = 0

const reportBody = {
  type: 'fallen_tree',
  severity: 'high',
  latitude: 46.1805,
  longitude: 10.905
}

async function createUser(role = 'hiker') {
  userCounter += 1
  const user = await User.create({
    email: `user${userCounter}@ecotrail.test`,
    password: 'hashed',
    role
  })
  const token = jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' })
  return { user, token }
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

function remove(path, token) {
  const req = request(app).delete(path)
  return token ? req.set('Authorization', `Bearer ${token}`) : req
}

async function postReportFromNewUser(body = reportBody) {
  const { token } = await createUser()
  const res = await request(app)
    .post('/api/reports')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
  expect(res.status).toBe(201)
  return res.body.id
}

async function reload() {
  return Trail.findById(trail._id)
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
    TrailStatusHistory.deleteMany({})
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

describe('GET /api/trails/:id/alert-rules', () => {
  it('returns 401 without a token and 403 for a hiker', async () => {
    const { token } = await createUser()

    expect((await get(`/api/trails/${trail._id}/alert-rules`)).status).toBe(401)
    expect((await get(`/api/trails/${trail._id}/alert-rules`, token)).status).toBe(403)
  })

  it('returns 400 for an invalid id and 404 for a missing trail', async () => {
    expect((await get('/api/trails/not-an-id/alert-rules', admin.token)).status).toBe(400)
    const missing = new mongoose.Types.ObjectId()
    expect((await get(`/api/trails/${missing}/alert-rules`, admin.token)).status).toBe(404)
  })

  it('returns the defaults and no own values for a new trail', async () => {
    const res = await get(`/api/trails/${trail._id}/alert-rules`, admin.token)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      riskCount: null,
      closeCount: null,
      windowHours: null,
      radiusMeters: null,
      defaults: { riskCount: 3, closeCount: 5, windowHours: 6, radiusMeters: 500 },
      effective: { riskCount: 3, closeCount: 5, windowHours: 6, radiusMeters: 500 },
      closureProposal: null
    })
  })
})

describe('PATCH /api/trails/:id/alert-rules', () => {
  const url = () => `/api/trails/${trail._id}/alert-rules`

  it('returns 401 without a token and 403 for a hiker', async () => {
    const { token } = await createUser()

    expect((await patch(url(), null, { riskCount: 2 })).status).toBe(401)
    expect((await patch(url(), token, { riskCount: 2 })).status).toBe(403)
  })

  it('saves some values and leaves the others on their defaults', async () => {
    const res = await patch(url(), admin.token, { riskCount: 2, radiusMeters: 800 })

    expect(res.status).toBe(200)
    expect(res.body.riskCount).toBe(2)
    expect(res.body.closeCount).toBeNull()
    expect(res.body.effective).toEqual({
      riskCount: 2,
      closeCount: 5,
      windowHours: 6,
      radiusMeters: 800
    })
    expect((await reload()).alertRules.riskCount).toBe(2)
  })

  it('goes back to the default when a value is set to null', async () => {
    await patch(url(), admin.token, { riskCount: 2 })

    const res = await patch(url(), admin.token, { riskCount: null })

    expect(res.status).toBe(200)
    expect(res.body.riskCount).toBeNull()
    expect(res.body.effective.riskCount).toBe(3)
  })

  it.each([
    ['riskCount', 0],
    ['riskCount', 21],
    ['riskCount', 2.5],
    ['closeCount', 51],
    ['windowHours', 0],
    ['windowHours', 73],
    ['radiusMeters', 10],
    ['radiusMeters', 2001],
    ['radiusMeters', '500']
  ])('rejects %s = %j', async (field, value) => {
    const res = await patch(url(), admin.token, { [field]: value })

    expect(res.status).toBe(400)
  })

  it('rejects a closure threshold lower than the at risk one', async () => {
    const res = await patch(url(), admin.token, { riskCount: 6, closeCount: 4 })

    expect(res.status).toBe(400)
    expect((await reload()).alertRules.riskCount).toBeUndefined()
  })

  it('returns 400 when there is nothing to change', async () => {
    expect((await patch(url(), admin.token, {})).status).toBe(400)
  })
})

describe('DELETE /api/trails/:id/closure-proposal', () => {
  const url = () => `/api/trails/${trail._id}/closure-proposal`

  async function addProposal() {
    await Trail.findByIdAndUpdate(trail._id, {
      closureProposal: { reason: 'Automatic: test', reportCount: 5, proposedAt: new Date() }
    })
  }

  it('returns 401 without a token and 403 for a hiker', async () => {
    const { token } = await createUser()

    expect((await remove(url())).status).toBe(401)
    expect((await remove(url(), token)).status).toBe(403)
  })

  it('returns 404 when there is nothing to dismiss', async () => {
    expect((await remove(url(), admin.token)).status).toBe(404)
  })

  it('dismisses the proposal and remembers when', async () => {
    await addProposal()

    const res = await remove(url(), admin.token)

    expect(res.status).toBe(200)
    expect(res.body.closureProposal).toBeNull()
    const saved = await reload()
    expect(saved.closureProposal).toBeUndefined()
    expect(saved.closureDismissedAt).toBeInstanceOf(Date)
  })

  it('is shown in the rules while it is waiting', async () => {
    await addProposal()

    const res = await get(`/api/trails/${trail._id}/alert-rules`, admin.token)

    expect(res.body.closureProposal).toMatchObject({ reason: 'Automatic: test', reportCount: 5 })
  })
})

describe('closing a trail from the status endpoint', () => {
  it('clears the closure proposal', async () => {
    await Trail.findByIdAndUpdate(trail._id, {
      closureProposal: { reason: 'Automatic: test', reportCount: 5, proposedAt: new Date() }
    })

    const res = await patch(`/api/trails/${trail._id}/status`, admin.token, {
      status: 'closed',
      reason: 'Confirmed by the admin'
    })

    expect(res.status).toBe(200)
    expect((await reload()).closureProposal).toBeUndefined()
  })
})

describe('from reports to an alert', () => {
  it('marks the trail at risk when three different users report the same problem', async () => {
    await postReportFromNewUser()
    await postReportFromNewUser()
    expect((await reload()).status).toBe('free')

    await postReportFromNewUser()

    expect((await reload()).status).toBe('at_risk')
    const entry = await TrailStatusHistory.findOne({ trail: trail._id })
    expect(entry.changedBy).toBeNull()
    expect(entry.reason).toContain('Automatic')
  })

  it('does not mark it when one user reports the problem three times', async () => {
    const { token } = await createUser()
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${token}`)
        .send(reportBody)
    }

    expect((await reload()).status).toBe('free')
  })

  it('proposes the closure to the admin when five serious reports gather', async () => {
    for (let i = 0; i < 5; i++) await postReportFromNewUser()

    const saved = await reload()
    expect(saved.status).toBe('at_risk')
    expect(saved.closureProposal.reportCount).toBe(5)

    const res = await get(`/api/trails/${trail._id}/alert-rules`, admin.token)
    expect(res.body.closureProposal.reportCount).toBe(5)
  })

  it('also checks the trail when an admin validates a report', async () => {
    const ids = []
    for (let i = 0; i < 3; i++) {
      const { user } = await createUser()
      const report = await Report.create({
        author: user._id,
        type: 'fallen_tree',
        severity: 'medium',
        trail: trail._id,
        trustScore: 2,
        location: { type: 'Point', coordinates: [10.905, 46.1805] }
      })
      ids.push(report._id)
    }
    expect((await reload()).status).toBe('free')

    const res = await patch(`/api/reports/${ids[0]}/validate`, admin.token, { status: 'validated' })

    expect(res.status).toBe(200)
    expect((await reload()).status).toBe('at_risk')
  })
})
