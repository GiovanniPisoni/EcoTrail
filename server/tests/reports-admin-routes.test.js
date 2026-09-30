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
        [10.91, latitude]
      ]
    }
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
    ...overrides
  })
}

function getReports(query) {
  return request(app).get('/api/reports').query(query)
}

function getAdminReports(token, query) {
  const req = request(app).get('/api/reports/admin')
  if (token) req.set('Authorization', `Bearer ${token}`)
  return query ? req.query(query) : req
}

function validateReport(id, token, body) {
  const req = request(app).patch(`/api/reports/${id}/validate`)
  if (token) req.set('Authorization', `Bearer ${token}`)
  return body === undefined ? req : req.send(body)
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Trail.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Trail.deleteMany({}), Report.deleteMany({})])
})

const BBOX = '10,40,11,41'

describe('GET /api/reports', () => {
  it('returns 400 without a bbox', async () => {
    const res = await getReports()

    expect(res.status).toBe(400)
  })

  it('returns 400 for a malformed bbox', async () => {
    const res = await getReports({ bbox: 'not-a-bbox' })

    expect(res.status).toBe(400)
  })

  it('returns only validated reports within the bbox', async () => {
    const { user } = await createUser()
    const trail = await Trail.create(trailAt('Trail', 40.5))

    const validated = await createReport(user, trail, {
      validationStatus: 'validated',
      location: { type: 'Point', coordinates: [10.5, 40.5] }
    })
    await createReport(user, trail, {
      validationStatus: 'pending',
      location: { type: 'Point', coordinates: [10.5, 40.5] }
    })
    await createReport(user, trail, {
      validationStatus: 'rejected',
      location: { type: 'Point', coordinates: [10.5, 40.5] }
    })

    const res = await getReports({ bbox: BBOX })

    expect(res.status).toBe(200)
    expect(res.body.type).toBe('FeatureCollection')
    expect(res.body.features).toHaveLength(1)
    expect(res.body.features[0].properties.id).toBe(validated._id.toString())
  })

  it('returns 400 for an invalid type filter', async () => {
    const res = await getReports({ bbox: BBOX, type: 'not-a-type' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid since date', async () => {
    const res = await getReports({ bbox: BBOX, since: 'not-a-date' })

    expect(res.status).toBe(400)
  })

  it('excludes reports created before the given since date', async () => {
    const { user } = await createUser()
    const trail = await Trail.create(trailAt('Trail', 40.5))
    await createReport(user, trail, {
      validationStatus: 'validated',
      location: { type: 'Point', coordinates: [10.5, 40.5] }
    })

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const res = await getReports({ bbox: BBOX, since: tomorrow })

    expect(res.status).toBe(200)
    expect(res.body.features).toHaveLength(0)
  })
})

describe('GET /api/reports/admin', () => {
  it('returns 401 without a token', async () => {
    const res = await getAdminReports()

    expect(res.status).toBe(401)
  })

  it('returns 403 for a hiker', async () => {
    const { token } = await createUser('hiker')

    const res = await getAdminReports(token)

    expect(res.status).toBe(403)
  })

  it('lists reports with author, trail and pagination for an admin', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')
    const { user: hiker } = await createUser('hiker', 'hiker@ecotrail.test')
    const trail = await Trail.create(trailAt('Trail', 40.5))
    const report = await createReport(hiker, trail)

    const res = await getAdminReports(token)

    expect(res.status).toBe(200)
    expect(res.body.reports).toHaveLength(1)
    expect(res.body.reports[0]).toMatchObject({
      id: report._id.toString(),
      author: { email: 'hiker@ecotrail.test' },
      trail: { name: 'Trail' },
      validationStatus: 'pending'
    })
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 1, pages: 1 })
  })

  it('filters by validationStatus', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')
    const { user: hiker } = await createUser('hiker', 'hiker@ecotrail.test')
    const trail = await Trail.create(trailAt('Trail', 40.5))
    await createReport(hiker, trail, { validationStatus: 'pending' })
    await createReport(hiker, trail, { validationStatus: 'validated' })

    const res = await getAdminReports(token, { validationStatus: 'validated' })

    expect(res.status).toBe(200)
    expect(res.body.reports).toHaveLength(1)
    expect(res.body.reports[0].validationStatus).toBe('validated')
  })

  it('returns 400 for an invalid validationStatus filter', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')

    const res = await getAdminReports(token, { validationStatus: 'not-a-status' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid severity filter', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')

    const res = await getAdminReports(token, { severity: 'critical' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for a malformed trail id filter', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')

    const res = await getAdminReports(token, { trail: 'not-an-id' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid page number', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')

    const res = await getAdminReports(token, { page: '0' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for a limit above the allowed maximum', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')

    const res = await getAdminReports(token, { limit: '101' })

    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/reports/:id/validate', () => {
  it('returns 401 without a token', async () => {
    const res = await validateReport(new mongoose.Types.ObjectId(), null, { status: 'validated' })

    expect(res.status).toBe(401)
  })

  it('returns 403 for a hiker', async () => {
    const { token } = await createUser('hiker')

    const res = await validateReport(new mongoose.Types.ObjectId(), token, { status: 'validated' })

    expect(res.status).toBe(403)
  })

  it('returns 400 for a malformed report id', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')

    const res = await validateReport('not-an-id', token, { status: 'validated' })

    expect(res.status).toBe(400)
  })

  it('returns 400 when the status is missing', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')
    const { user: hiker } = await createUser('hiker', 'hiker@ecotrail.test')
    const trail = await Trail.create(trailAt('Trail', 40.5))
    const report = await createReport(hiker, trail)

    const res = await validateReport(report._id, token, {})

    expect(res.status).toBe(400)
    const unchanged = await Report.findById(report._id)
    expect(unchanged.validationStatus).toBe('pending')
  })

  it('returns 400 for an invalid status value', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')
    const { user: hiker } = await createUser('hiker', 'hiker@ecotrail.test')
    const trail = await Trail.create(trailAt('Trail', 40.5))
    const report = await createReport(hiker, trail)

    const res = await validateReport(report._id, token, { status: 'pending' })

    expect(res.status).toBe(400)
  })

  it('returns 404 for a report that does not exist', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')

    const res = await validateReport(new mongoose.Types.ObjectId(), token, { status: 'validated' })

    expect(res.status).toBe(404)
  })

  it('validates a report and records who reviewed it', async () => {
    const { user: admin, token } = await createUser('admin', 'admin@ecotrail.test')
    const { user: hiker } = await createUser('hiker', 'hiker@ecotrail.test')
    const trail = await Trail.create(trailAt('Trail', 40.5))
    const report = await createReport(hiker, trail)

    const res = await validateReport(report._id, token, { status: 'validated' })

    expect(res.status).toBe(200)
    expect(res.body.validationStatus).toBe('validated')

    const saved = await Report.findById(report._id)
    expect(saved.validationStatus).toBe('validated')
    expect(saved.validatedBy.equals(admin._id)).toBe(true)
    expect(saved.validatedAt).toBeInstanceOf(Date)
  })

  it('rejects a report with a note', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')
    const { user: hiker } = await createUser('hiker', 'hiker@ecotrail.test')
    const trail = await Trail.create(trailAt('Trail', 40.5))
    const report = await createReport(hiker, trail)

    const res = await validateReport(report._id, token, {
      status: 'rejected',
      note: 'Duplicate of another report'
    })

    expect(res.status).toBe(200)
    expect(res.body.validationStatus).toBe('rejected')

    const saved = await Report.findById(report._id)
    expect(saved.validationNote).toBe('Duplicate of another report')
  })
})
