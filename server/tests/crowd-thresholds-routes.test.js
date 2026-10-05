import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/index.js'
import User from '../src/models/User.js'
import Trail from '../src/models/Trail.js'

const JWT_SECRET = 'test-secret'

let mongod

async function createUser(role) {
  const user = await User.create({ email: `${role}@ecotrail.test`, password: 'hashed', role })
  return jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' })
}

function createTrail(extra = {}) {
  return Trail.create({
    name: 'Trail',
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, 46.18],
        [10.91, 46.18]
      ]
    },
    distanceKm: 5,
    ...extra
  })
}

function getThresholds(id, token) {
  const req = request(app).get(`/api/trails/${id}/crowd-thresholds`)
  return token ? req.set('Authorization', `Bearer ${token}`) : req
}

function patchThresholds(id, token, body) {
  const req = request(app).patch(`/api/trails/${id}/crowd-thresholds`)
  if (token) req.set('Authorization', `Bearer ${token}`)
  return req.send(body)
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
  await Promise.all([User.deleteMany({}), Trail.deleteMany({})])
})

describe('GET /api/trails/:id/crowd-thresholds', () => {
  it('returns 401 without a token', async () => {
    const trail = await createTrail()

    const res = await getThresholds(trail._id)

    expect(res.status).toBe(401)
  })

  it('returns 403 for a hiker', async () => {
    const trail = await createTrail()
    const token = await createUser('hiker')

    const res = await getThresholds(trail._id, token)

    expect(res.status).toBe(403)
  })

  it('returns 400 for a malformed trail id', async () => {
    const token = await createUser('admin')

    const res = await getThresholds('not-an-id', token)

    expect(res.status).toBe(400)
  })

  it('returns 404 for a trail that does not exist', async () => {
    const token = await createUser('admin')

    const res = await getThresholds(new mongoose.Types.ObjectId(), token)

    expect(res.status).toBe(404)
  })

  it('returns the defaults when nothing was customised', async () => {
    const trail = await createTrail()
    const token = await createUser('admin')

    const res = await getThresholds(trail._id, token)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      crowdThreshold: null,
      crowdReleaseThreshold: null,
      defaults: { enter: 20, release: 14 },
      effective: { enter: 20, release: 14 }
    })
  })

  it('returns the customised values as the effective ones', async () => {
    const trail = await createTrail({ crowdThreshold: 8, crowdReleaseThreshold: 3 })
    const token = await createUser('admin')

    const res = await getThresholds(trail._id, token)

    expect(res.body.crowdThreshold).toBe(8)
    expect(res.body.effective).toEqual({ enter: 8, release: 3 })
    expect(res.body.defaults).toEqual({ enter: 20, release: 14 })
  })
})

describe('PATCH /api/trails/:id/crowd-thresholds', () => {
  it('returns 401 without a token', async () => {
    const trail = await createTrail()

    const res = await patchThresholds(trail._id, null, { crowdThreshold: 8 })

    expect(res.status).toBe(401)
  })

  it('returns 403 for a hiker', async () => {
    const trail = await createTrail()
    const token = await createUser('hiker')

    const res = await patchThresholds(trail._id, token, { crowdThreshold: 8 })

    expect(res.status).toBe(403)
    expect((await Trail.findById(trail._id)).crowdThreshold).toBeUndefined()
  })

  it('returns 400 for a malformed trail id', async () => {
    const token = await createUser('admin')

    const res = await patchThresholds('not-an-id', token, { crowdThreshold: 8 })

    expect(res.status).toBe(400)
  })

  it('returns 404 for a trail that does not exist', async () => {
    const token = await createUser('admin')

    const res = await patchThresholds(new mongoose.Types.ObjectId(), token, { crowdThreshold: 8 })

    expect(res.status).toBe(404)
  })

  it('returns 400 when no field is provided', async () => {
    const trail = await createTrail()
    const token = await createUser('admin')

    const res = await patchThresholds(trail._id, token, {})

    expect(res.status).toBe(400)
  })

  it.each([0, -3, 2.5, '8', 5000])('returns 400 for the invalid value %s', async (value) => {
    const trail = await createTrail()
    const token = await createUser('admin')

    const res = await patchThresholds(trail._id, token, { crowdThreshold: value })

    expect(res.status).toBe(400)
    expect((await Trail.findById(trail._id)).crowdThreshold).toBeUndefined()
  })

  it('saves the alert threshold and derives the release one', async () => {
    const trail = await createTrail()
    const token = await createUser('admin')

    const res = await patchThresholds(trail._id, token, { crowdThreshold: 10 })

    expect(res.status).toBe(200)
    expect(res.body.crowdThreshold).toBe(10)
    expect(res.body.crowdReleaseThreshold).toBeNull()
    expect(res.body.effective).toEqual({ enter: 10, release: 7 })
    expect((await Trail.findById(trail._id)).crowdThreshold).toBe(10)
  })

  it('saves both thresholds', async () => {
    const trail = await createTrail()
    const token = await createUser('admin')

    const res = await patchThresholds(trail._id, token, {
      crowdThreshold: 10,
      crowdReleaseThreshold: 4
    })

    expect(res.status).toBe(200)
    expect(res.body.effective).toEqual({ enter: 10, release: 4 })
  })

  it('returns 400 when the release threshold is not lower than the alert threshold', async () => {
    const trail = await createTrail()
    const token = await createUser('admin')

    const res = await patchThresholds(trail._id, token, {
      crowdThreshold: 6,
      crowdReleaseThreshold: 6
    })

    expect(res.status).toBe(400)
    expect((await Trail.findById(trail._id)).crowdThreshold).toBeUndefined()
  })

  it('returns 400 when a new alert threshold falls below the stored release one', async () => {
    const trail = await createTrail({ crowdThreshold: 10, crowdReleaseThreshold: 8 })
    const token = await createUser('admin')

    const res = await patchThresholds(trail._id, token, { crowdThreshold: 5 })

    expect(res.status).toBe(400)
    expect((await Trail.findById(trail._id)).crowdThreshold).toBe(10)
  })

  it('returns 400 for an alert threshold of 1', async () => {
    const trail = await createTrail()
    const token = await createUser('admin')

    const res = await patchThresholds(trail._id, token, { crowdThreshold: 1 })

    expect(res.status).toBe(400)
  })

  it('resets to the defaults with null', async () => {
    const trail = await createTrail({ crowdThreshold: 8, crowdReleaseThreshold: 3 })
    const token = await createUser('admin')

    const res = await patchThresholds(trail._id, token, {
      crowdThreshold: null,
      crowdReleaseThreshold: null
    })

    expect(res.status).toBe(200)
    expect(res.body.effective).toEqual({ enter: 20, release: 14 })
    const saved = await Trail.findById(trail._id)
    expect(saved.crowdThreshold).toBeUndefined()
    expect(saved.crowdReleaseThreshold).toBeUndefined()
  })
})
