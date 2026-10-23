import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../src/index.js'
import User from '../../src/models/User.js'
import Trail from '../../src/models/Trail.js'

const JWT_SECRET = 'test-secret'

let mongod

function samplePath() {
  return {
    type: 'LineString',
    coordinates: [
      [10.9, 46.18],
      [10.91, 46.19]
    ]
  }
}

async function tokenFor(role, email) {
  const user = await User.create({ email, password: 'hashed', role })
  return jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' })
}

function getAttention(token) {
  const req = request(app).get('/api/trails/attention')
  if (token) req.set('Authorization', `Bearer ${token}`)
  return req
}

const proposal = { reason: 'Many serious reports', reportCount: 5, proposedAt: new Date() }

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

describe('GET /api/trails/attention', () => {
  it('returns 401 without a token', async () => {
    const res = await getAttention()

    expect(res.status).toBe(401)
  })

  it('returns 403 for a hiker', async () => {
    const token = await tokenFor('hiker', 'hiker@ecotrail.test')

    const res = await getAttention(token)

    expect(res.status).toBe(403)
  })

  it('lists at risk trails and trails with a closure proposal, but not the others', async () => {
    await Trail.create([
      { name: 'Free trail', path: samplePath() },
      { name: 'Crowded trail', path: samplePath(), status: 'crowded' },
      { name: 'Closed trail', path: samplePath(), status: 'closed', closureProposal: proposal },
      { name: 'Risky trail', path: samplePath(), status: 'at_risk' },
      { name: 'Proposed trail', path: samplePath(), status: 'at_risk', closureProposal: proposal }
    ])
    const token = await tokenFor('admin', 'admin@ecotrail.test')

    const res = await getAttention(token)

    expect(res.status).toBe(200)
    expect(res.body.map((trail) => trail.name)).toEqual(['Proposed trail', 'Risky trail'])
    expect(res.body[0]).toMatchObject({ closureProposed: true, status: 'at_risk' })
    expect(res.body[1].closureProposed).toBe(false)
    expect(res.body[0].bounds).toEqual([10.9, 46.18, 10.91, 46.19])
  })

  it('returns an empty list when nothing needs attention', async () => {
    await Trail.create({ name: 'Free trail', path: samplePath() })
    const token = await tokenFor('admin', 'admin@ecotrail.test')

    const res = await getAttention(token)

    expect(res.body).toEqual([])
  })
})
