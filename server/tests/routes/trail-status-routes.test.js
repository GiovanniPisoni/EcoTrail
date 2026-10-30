import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../src/index.js'
import User from '../../src/models/User.js'
import Trail from '../../src/models/Trail.js'
import TrailStatusHistory from '../../src/models/TrailStatusHistory.js'
import Report from '../../src/models/Report.js'
import { TRAIL_STATUS_CHANGED, trailEvents } from '../../src/services/trails/trailEvents.js'

const JWT_SECRET = 'test-secret'

let mongod

function samplePath() {
  return {
    type: 'LineString',
    coordinates: [
      [10.9, 46.18],
      [10.91, 46.18]
    ]
  }
}

async function createUserAndToken(role = 'admin', email = 'admin@ecotrail.test') {
  const user = await User.create({ email, password: 'hashed', role })
  const token = jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' })
  return { user, token }
}

function patchStatus(id, token, body) {
  const req = request(app).patch(`/api/trails/${id}/status`)
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
  await Promise.all([
    User.deleteMany({}),
    Trail.deleteMany({}),
    TrailStatusHistory.deleteMany({}),
    Report.deleteMany({})
  ])
})

describe('PATCH /api/trails/:id/status', () => {
  it('returns 401 without a token', async () => {
    const trail = await Trail.create({ name: 'Test trail', path: samplePath() })

    const res = await patchStatus(trail._id, undefined, { status: 'closed', reason: 'Test' })

    expect(res.status).toBe(401)
  })

  it('returns 403 for a hiker', async () => {
    const trail = await Trail.create({ name: 'Test trail', path: samplePath() })
    const { token } = await createUserAndToken('hiker', 'hiker@ecotrail.test')

    const res = await patchStatus(trail._id, token, { status: 'closed', reason: 'Test' })

    expect(res.status).toBe(403)
  })

  it('returns 400 for a malformed trail id', async () => {
    const { token } = await createUserAndToken()

    const res = await patchStatus('not-an-id', token, { status: 'closed', reason: 'Test' })

    expect(res.status).toBe(400)
  })

  it('returns 404 for a trail that does not exist', async () => {
    const { token } = await createUserAndToken()
    const missingId = new mongoose.Types.ObjectId()

    const res = await patchStatus(missingId, token, { status: 'closed', reason: 'Test' })

    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid status value', async () => {
    const trail = await Trail.create({ name: 'Test trail', path: samplePath() })
    const { token } = await createUserAndToken()

    const res = await patchStatus(trail._id, token, { status: 'on_fire', reason: 'Test' })

    expect(res.status).toBe(400)
  })

  it.each([undefined, '', '   '])('returns 400 when the reason is missing (%j)', async (reason) => {
    const trail = await Trail.create({ name: 'Test trail', path: samplePath() })
    const { token } = await createUserAndToken()

    const res = await patchStatus(trail._id, token, { status: 'closed', reason })

    expect(res.status).toBe(400)
  })

  it('returns 400 when the reason is too long', async () => {
    const trail = await Trail.create({ name: 'Test trail', path: samplePath() })
    const { token } = await createUserAndToken()

    const res = await patchStatus(trail._id, token, { status: 'closed', reason: 'a'.repeat(501) })

    expect(res.status).toBe(400)
  })

  it('returns 409 when the trail already has that status, and creates no history entry', async () => {
    const trail = await Trail.create({ name: 'Test trail', path: samplePath(), status: 'free' })
    const { token } = await createUserAndToken()

    const res = await patchStatus(trail._id, token, { status: 'free', reason: 'No change' })

    expect(res.status).toBe(409)
    expect(await TrailStatusHistory.countDocuments()).toBe(0)
  })

  it('updates the trail, records history and emits the event on success', async () => {
    const trail = await Trail.create({ name: 'Test trail', path: samplePath(), status: 'free' })
    const { user, token } = await createUserAndToken()

    const listener = vi.fn()
    trailEvents.on(TRAIL_STATUS_CHANGED, listener)

    const res = await patchStatus(trail._id, token, {
      status: 'at_risk',
      reason: '  Rockfall reported  '
    })

    trailEvents.off(TRAIL_STATUS_CHANGED, listener)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('at_risk')
    expect(res.body.historyEntry.previousStatus).toBe('free')
    expect(res.body.historyEntry.newStatus).toBe('at_risk')
    expect(res.body.historyEntry.reason).toBe('Rockfall reported')

    const updated = await Trail.findById(trail._id)
    expect(updated.status).toBe('at_risk')

    const history = await TrailStatusHistory.find({ trail: trail._id })
    expect(history).toHaveLength(1)
    expect(history[0].previousStatus).toBe('free')
    expect(history[0].newStatus).toBe('at_risk')
    expect(history[0].reason).toBe('Rockfall reported')
    expect(history[0].changedBy.equals(user._id)).toBe(true)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        trailName: 'Test trail',
        previousStatus: 'free',
        newStatus: 'at_risk',
        reason: 'Rockfall reported'
      })
    )
  })
})

describe('PATCH /api/trails/:id/status with validateReports', () => {
  async function setup({ proposed = true } = {}) {
    const trail = await Trail.create({
      name: 'Test trail',
      path: samplePath(),
      status: 'at_risk',
      ...(proposed && {
        closureProposal: { reason: 'Automatic', reportCount: 3, proposedAt: new Date() }
      })
    })
    const { token } = await createUserAndToken()
    const { user: hiker } = await createUserAndToken('hiker', 'hiker@ecotrail.test')

    const make = (overrides) =>
      Report.create({
        author: hiker._id,
        trail: trail._id,
        type: 'fallen_tree',
        severity: 'high',
        location: { type: 'Point', coordinates: [10.905, 46.18] },
        validationStatus: 'pending',
        trustScore: 3,
        ...overrides
      })

    const behind = await make({})
    const others = {
      suspicious: await make({ isSuspicious: true }),
      rejected: await make({ validationStatus: 'rejected' }),
      medium: await make({ severity: 'medium' }),
      unreliable: await make({ trustScore: 0 })
    }
    return { trail, token, behind, others }
  }

  async function statusOf(report) {
    return (await Report.findById(report._id)).validationStatus
  }

  it('validates the pending reports behind the proposal when the trail is closed', async () => {
    const { trail, token, behind, others } = await setup()

    const res = await patchStatus(trail._id, token, {
      status: 'closed',
      reason: 'Closed after admin review',
      validateReports: true
    })

    expect(res.status).toBe(200)
    expect(res.body.validatedReports).toBe(1)
    expect(await statusOf(behind)).toBe('validated')
    expect(await statusOf(others.suspicious)).toBe('pending')
    expect(await statusOf(others.rejected)).toBe('rejected')
    expect(await statusOf(others.medium)).toBe('pending')
    expect(await statusOf(others.unreliable)).toBe('pending')
  })

  it('leaves the reports alone unless the admin asks for it', async () => {
    const { trail, token, behind } = await setup()

    const res = await patchStatus(trail._id, token, {
      status: 'closed',
      reason: 'Closed after admin review'
    })

    expect(res.status).toBe(200)
    expect(res.body.validatedReports).toBe(0)
    expect(await statusOf(behind)).toBe('pending')
  })

  it('validates nothing when there was no closure proposal', async () => {
    const { trail, token, behind } = await setup({ proposed: false })

    const res = await patchStatus(trail._id, token, {
      status: 'closed',
      reason: 'Closed by hand',
      validateReports: true
    })

    expect(res.body.validatedReports).toBe(0)
    expect(await statusOf(behind)).toBe('pending')
  })
})

describe('GET /api/trails/:id/history', () => {
  function getHistory(id, token) {
    const req = request(app).get(`/api/trails/${id}/history`)
    if (token) req.set('Authorization', `Bearer ${token}`)
    return req
  }

  it('returns 401 without a token', async () => {
    const trail = await Trail.create({ name: 'Test trail', path: samplePath() })

    expect((await getHistory(trail._id, undefined)).status).toBe(401)
  })

  it('returns 403 for a hiker', async () => {
    const trail = await Trail.create({ name: 'Test trail', path: samplePath() })
    const { token } = await createUserAndToken('hiker', 'hiker@ecotrail.test')

    expect((await getHistory(trail._id, token)).status).toBe(403)
  })

  it('returns an empty list for a trail with no history yet', async () => {
    const trail = await Trail.create({ name: 'Test trail', path: samplePath() })
    const { token } = await createUserAndToken()

    const res = await getHistory(trail._id, token)

    expect(res.status).toBe(200)
    expect(res.body.history).toEqual([])
  })

  it('returns entries most recent first, with the email of who changed it', async () => {
    const trail = await Trail.create({ name: 'Test trail', path: samplePath(), status: 'free' })
    const { token } = await createUserAndToken()

    await patchStatus(trail._id, token, { status: 'crowded', reason: 'First change' })
    await patchStatus(trail._id, token, { status: 'at_risk', reason: 'Second change' })

    const res = await getHistory(trail._id, token)

    expect(res.status).toBe(200)
    expect(res.body.history).toHaveLength(2)
    expect(res.body.history[0].reason).toBe('Second change')
    expect(res.body.history[1].reason).toBe('First change')
    expect(res.body.history[0].changedBy.email).toBe('admin@ecotrail.test')
    expect(res.body.history[0].alertedCount).toBe(0)
  })
})
