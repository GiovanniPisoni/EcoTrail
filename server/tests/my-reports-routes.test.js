import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/index.js'
import User from '../src/models/User.js'
import Trail from '../src/models/Trail.js'
import Report from '../src/models/Report.js'

const JWT_SECRET = 'test-secret'

let mongod

function trailAt(name, latitude) {
  return {
    name,
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, latitude],
        [10.91, latitude],
      ],
    },
  }
}

async function createUser(role = 'hiker', email = 'hiker@ecotrail.test') {
  const user = await User.create({ email, password: 'hashed', role })
  const token = jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' })
  return { user, token }
}

async function createReport(author, trail, overrides = {}) {
  return Report.create({
    author: author._id,
    trail: trail._id,
    type: 'fallen_tree',
    severity: 'medium',
    location: { type: 'Point', coordinates: [10.905, 46.18] },
    validationStatus: 'pending',
    ...overrides,
  })
}

function withdrawReport(id, token) {
  const req = request(app).patch(`/api/reports/${id}/withdraw`)
  if (token) req.set('Authorization', `Bearer ${token}`)
  return req
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
  await Promise.all([User.deleteMany({}), Trail.deleteMany({}), Report.deleteMany({})])
})

describe('GET /api/reports/me', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/reports/me')
    expect(res.status).toBe(401)
  })

  it("returns only the authenticated user's reports, newest first", async () => {
    const { user, token } = await createUser()
    const other = await User.create({ email: 'other@ecotrail.test', password: 'hashed' })
    const trail = await Trail.create(trailAt('Test trail', 46.18))

    const older = await createReport(user, trail, { createdAt: new Date(Date.now() - 60000) })
    const newer = await createReport(user, trail)
    await createReport(other, trail)

    const res = await request(app).get('/api/reports/me').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.reports.map((r) => r.id)).toEqual([
      newer._id.toString(),
      older._id.toString(),
    ])
    expect(res.body.reports[0].trail).toEqual({ id: trail._id.toString(), name: 'Test trail' })
  })

  it('returns an empty list when the user has no reports', async () => {
    const { token } = await createUser()

    const res = await request(app).get('/api/reports/me').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.reports).toEqual([])
  })
})

describe('PATCH /api/reports/:id/withdraw', () => {
  it('returns 401 without a token', async () => {
    const res = await withdrawReport(new mongoose.Types.ObjectId(), undefined)
    expect(res.status).toBe(401)
  })

  it('returns 400 for a malformed report id', async () => {
    const { token } = await createUser()

    const res = await withdrawReport('not-an-id', token)

    expect(res.status).toBe(400)
  })

  it('returns 404 for a report that does not exist', async () => {
    const { token } = await createUser()

    const res = await withdrawReport(new mongoose.Types.ObjectId(), token)

    expect(res.status).toBe(404)
  })

  it("returns 403 when trying to withdraw someone else's report", async () => {
    const { user: owner } = await createUser('hiker', 'owner@ecotrail.test')
    const { token: otherToken } = await createUser('hiker', 'other@ecotrail.test')
    const trail = await Trail.create(trailAt('Test trail', 46.18))
    const report = await createReport(owner, trail)

    const res = await withdrawReport(report._id, otherToken)

    expect(res.status).toBe(403)
    expect((await Report.findById(report._id)).validationStatus).toBe('pending')
  })

  it.each(['validated', 'rejected', 'withdrawn'])(
    'returns 409 when the report is already %s',
    async (validationStatus) => {
      const { user, token } = await createUser()
      const trail = await Trail.create(trailAt('Test trail', 46.18))
      const report = await createReport(user, trail, { validationStatus })

      const res = await withdrawReport(report._id, token)

      expect(res.status).toBe(409)
      expect((await Report.findById(report._id)).validationStatus).toBe(validationStatus)
    },
  )

  it('withdraws a pending report owned by the caller', async () => {
    const { user, token } = await createUser()
    const trail = await Trail.create(trailAt('Test trail', 46.18))
    const report = await createReport(user, trail)

    const res = await withdrawReport(report._id, token)

    expect(res.status).toBe(200)
    expect(res.body.validationStatus).toBe('withdrawn')

    const saved = await Report.findById(report._id)
    expect(saved.validationStatus).toBe('withdrawn')
  })

  it('lets an admin withdraw their own report too', async () => {
    const { user, token } = await createUser('admin', 'admin@ecotrail.test')
    const trail = await Trail.create(trailAt('Test trail', 46.18))
    const report = await createReport(user, trail)

    const res = await withdrawReport(report._id, token)

    expect(res.status).toBe(200)
  })
})
