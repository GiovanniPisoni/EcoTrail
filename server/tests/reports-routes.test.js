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

const validBody = {
  type: 'fallen_tree',
  severity: 'medium',
  description: 'Big pine across the path',
  latitude: 46.1805,
  longitude: 10.905,
}

async function createUser(role = 'hiker', email = 'hiker@ecotrail.test') {
  const user = await User.create({ email, password: 'hashed', role })
  const token = jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' })
  return { user, token }
}

function postReport(token, body) {
  return request(app).post('/api/reports').set('Authorization', `Bearer ${token}`).send(body)
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

describe('POST /api/reports', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/reports').send(validBody)

    expect(res.status).toBe(401)
    expect(await Report.countDocuments()).toBe(0)
  })

  it('saves a valid report linked to the nearest trail', async () => {
    const { user, token } = await createUser()
    const near = await Trail.create(trailAt('Near trail', 46.18))
    await Trail.create(trailAt('Far trail', 46.2))

    const res = await postReport(token, validBody)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      type: 'fallen_tree',
      severity: 'medium',
      description: 'Big pine across the path',
      latitude: 46.1805,
      longitude: 10.905,
      validationStatus: 'pending',
      trail: { id: near._id.toString(), name: 'Near trail' },
    })
    expect(res.body.id).toBeDefined()
    expect(res.body.createdAt).toBeDefined()

    const saved = await Report.findById(res.body.id)
    expect(saved.author.equals(user._id)).toBe(true)
    expect(saved.trail.equals(near._id)).toBe(true)
    expect([...saved.location.coordinates]).toEqual([10.905, 46.1805])
  })

  it('links the report to the closest trail when several are in range', async () => {
    const { token } = await createUser()
    await Trail.create(trailAt('Trail A', 46.18))
    const closer = await Trail.create(trailAt('Trail C', 46.1815))

    const res = await postReport(token, { ...validBody, latitude: 46.1811 })

    expect(res.status).toBe(201)
    expect(res.body.trail.id).toBe(closer._id.toString())
  })

  it('accepts a report without a description', async () => {
    const { token } = await createUser()
    await Trail.create(trailAt('Near trail', 46.18))
    const withoutDescription = { ...validBody }
    delete withoutDescription.description

    const res = await postReport(token, withoutDescription)

    expect(res.status).toBe(201)
    expect(res.body.description).toBeUndefined()
  })

  it('lets an admin submit a report too', async () => {
    const { token } = await createUser('admin', 'admin@ecotrail.test')
    await Trail.create(trailAt('Near trail', 46.18))

    const res = await postReport(token, validBody)

    expect(res.status).toBe(201)
  })

  it('always takes the author from the token and ignores validation fields sent by the client', async () => {
    const { user, token } = await createUser()
    const other = await User.create({ email: 'other@ecotrail.test', password: 'hashed' })
    await Trail.create(trailAt('Near trail', 46.18))

    const res = await postReport(token, {
      ...validBody,
      author: other._id.toString(),
      validationStatus: 'validated',
      trustScore: 99,
      isSuspicious: true,
    })

    expect(res.status).toBe(201)
    const saved = await Report.findById(res.body.id)
    expect(saved.author.equals(user._id)).toBe(true)
    expect(saved.validationStatus).toBe('pending')
    expect(saved.trustScore).toBe(0)
    expect(saved.isSuspicious).toBe(false)
  })

  it('rejects invalid data with a message for every wrong field and saves nothing', async () => {
    const { token } = await createUser()
    await Trail.create(trailAt('Near trail', 46.18))

    const res = await postReport(token, { type: 'tree', severity: 'critical', latitude: 'abc' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid report data')
    expect(Object.keys(res.body.details).sort()).toEqual(['latitude', 'longitude', 'severity', 'type'])
    expect(await Report.countDocuments()).toBe(0)
  })

  it('rejects a request without a body', async () => {
    const { token } = await createUser()

    const res = await request(app).post('/api/reports').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(await Report.countDocuments()).toBe(0)
  })

  it('rejects a position with no trail within 200 m using a clear message', async () => {
    const { token } = await createUser()
    await Trail.create(trailAt('Far trail', 46.2))

    const res = await postReport(token, validBody)

    expect(res.status).toBe(422)
    expect(res.body.error).toContain('200 m')
    expect(await Report.countDocuments()).toBe(0)
  })
})
