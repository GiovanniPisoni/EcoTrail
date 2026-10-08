import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../src/index.js'
import User from '../../src/models/User.js'
import UserPresence from '../../src/models/UserPresence.js'
import { ACTIVE_WINDOW_MS, isUserActive } from '../../src/services/presence/userPresence.js'
import { checkOvercrowdingNear } from '../../src/services/trails/overcrowding.js'
import { checkApproachAlerts } from '../../src/services/notifications/checkApproachAlerts.js'
import { recordTrailActivity } from '../../src/services/trails/trailActivity.js'

vi.mock('../../src/services/trails/overcrowding.js', async (importOriginal) => ({
  ...(await importOriginal()),
  checkOvercrowdingNear: vi.fn(async () => ({ changed: false }))
}))

vi.mock('../../src/services/notifications/checkApproachAlerts.js', async (importOriginal) => ({
  ...(await importOriginal()),
  checkApproachAlerts: vi.fn(async () => 0)
}))

vi.mock('../../src/services/trails/trailActivity.js', async (importOriginal) => ({
  ...(await importOriginal()),
  recordTrailActivity: vi.fn(async () => null)
}))

const JWT_SECRET = 'test-secret'

let mongod

async function createUser(email = 'hiker@ecotrail.test') {
  const user = await User.create({ email, password: 'hashed', role: 'hiker' })
  const token = jwt.sign({ id: user._id, role: 'hiker' }, JWT_SECRET, { expiresIn: '7d' })
  return { user, token }
}

function postPosition(token, body) {
  const req = request(app).post('/api/presence')
  if (token) req.set('Authorization', `Bearer ${token}`)
  return body === undefined ? req : req.send(body)
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await UserPresence.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  vi.clearAllMocks()
  await Promise.all([User.deleteMany({}), UserPresence.deleteMany({})])
})

describe('POST /api/presence', () => {
  it('triggers the overcrowding check for the saved position', async () => {
    const { token } = await createUser()

    const res = await postPosition(token, { latitude: 46.18, longitude: 10.9 })

    expect(res.status).toBe(200)
    expect(checkOvercrowdingNear).toHaveBeenCalledWith(46.18, 10.9)
  })

  it('records the trail activity for the saved position', async () => {
    const { user, token } = await createUser()

    const res = await postPosition(token, { latitude: 46.18, longitude: 10.9 })

    expect(res.status).toBe(200)
    expect(recordTrailActivity).toHaveBeenCalledWith(user.id, {
      latitude: 46.18,
      longitude: 10.9
    })
  })

  it('does not fail the request when recording the activity throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    recordTrailActivity.mockRejectedValueOnce(new Error('boom'))
    const { token } = await createUser()

    const res = await postPosition(token, { latitude: 46.18, longitude: 10.9 })

    expect(res.status).toBe(200)
  })

  it('does not fail the request when the overcrowding check throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    checkOvercrowdingNear.mockRejectedValueOnce(new Error('boom'))
    const { token } = await createUser()

    const res = await postPosition(token, { latitude: 46.18, longitude: 10.9 })

    expect(res.status).toBe(200)
  })

  it('checks for nearby dangers using the logged-in user and the saved position', async () => {
    const { user, token } = await createUser()

    const res = await postPosition(token, { latitude: 46.18, longitude: 10.9 })

    expect(res.status).toBe(200)
    expect(checkApproachAlerts).toHaveBeenCalledWith(user._id.toString(), {
      latitude: 46.18,
      longitude: 10.9
    })
  })

  it('does not fail the request when the approach check throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    checkApproachAlerts.mockRejectedValueOnce(new Error('boom'))
    const { token } = await createUser()

    const res = await postPosition(token, { latitude: 46.18, longitude: 10.9 })

    expect(res.status).toBe(200)
  })

  it('does not check anything for an invalid position', async () => {
    const { token } = await createUser()

    const res = await postPosition(token, { latitude: 'north', longitude: 10.9 })

    expect(res.status).toBe(400)
    expect(checkApproachAlerts).not.toHaveBeenCalled()
  })

  it('returns 401 without a token', async () => {
    const res = await postPosition(null, { latitude: 46.18, longitude: 10.9 })

    expect(res.status).toBe(401)
    expect(await UserPresence.countDocuments()).toBe(0)
  })

  it('saves the position of the authenticated user as a GeoJSON point', async () => {
    const { user, token } = await createUser()

    const res = await postPosition(token, { latitude: 46.18, longitude: 10.9 })

    expect(res.status).toBe(200)
    expect(res.body.updatedAt).toBeDefined()

    const saved = await UserPresence.findOne({ user: user._id })
    expect([...saved.location.coordinates]).toEqual([10.9, 46.18])
    expect(saved.location.type).toBe('Point')
  })

  it('keeps only the latest position: a second update replaces the first', async () => {
    const { user, token } = await createUser()

    await postPosition(token, { latitude: 46.18, longitude: 10.9 })
    await postPosition(token, { latitude: 46.2, longitude: 10.95 })

    expect(await UserPresence.countDocuments({ user: user._id })).toBe(1)
    const saved = await UserPresence.findOne({ user: user._id })
    expect([...saved.location.coordinates]).toEqual([10.95, 46.2])
  })

  it('stores a separate position for each user', async () => {
    const first = await createUser('first@ecotrail.test')
    const second = await createUser('second@ecotrail.test')

    await postPosition(first.token, { latitude: 46.18, longitude: 10.9 })
    await postPosition(second.token, { latitude: 46.3, longitude: 11 })

    expect(await UserPresence.countDocuments()).toBe(2)
  })

  it('accepts coordinates sent as numeric strings', async () => {
    const { user, token } = await createUser()

    const res = await postPosition(token, { latitude: '46.18', longitude: '10.9' })

    expect(res.status).toBe(200)
    const saved = await UserPresence.findOne({ user: user._id })
    expect([...saved.location.coordinates]).toEqual([10.9, 46.18])
  })

  it('always takes the user from the token and ignores a user sent by the client', async () => {
    const { user, token } = await createUser()
    const other = await createUser('other@ecotrail.test')

    await postPosition(token, {
      latitude: 46.18,
      longitude: 10.9,
      user: other.user._id.toString()
    })

    expect(await UserPresence.countDocuments({ user: other.user._id })).toBe(0)
    expect(await UserPresence.countDocuments({ user: user._id })).toBe(1)
  })

  it('rejects a request without a body and saves nothing', async () => {
    const { token } = await createUser()

    const res = await postPosition(token)

    expect(res.status).toBe(400)
    expect(await UserPresence.countDocuments()).toBe(0)
  })

  it('rejects missing coordinates with a message for each field', async () => {
    const { token } = await createUser()

    const res = await postPosition(token, { latitude: 46.18 })

    expect(res.status).toBe(400)
    expect(Object.keys(res.body.details)).toEqual(['longitude'])
  })

  it('rejects coordinates that are not numbers or are out of range', async () => {
    const { token } = await createUser()

    const notNumbers = await postPosition(token, { latitude: 'abc', longitude: null })
    const outOfRange = await postPosition(token, { latitude: 91, longitude: 181 })

    expect(notNumbers.status).toBe(400)
    expect(Object.keys(notNumbers.body.details).sort()).toEqual(['latitude', 'longitude'])
    expect(outOfRange.status).toBe(400)
    expect(Object.keys(outOfRange.body.details).sort()).toEqual(['latitude', 'longitude'])
    expect(await UserPresence.countDocuments()).toBe(0)
  })
})

describe('isUserActive', () => {
  it('is true for a user with a recent position', async () => {
    const { user, token } = await createUser()
    await postPosition(token, { latitude: 46.18, longitude: 10.9 })

    expect(await isUserActive(user._id)).toBe(true)
  })

  it('is false for a user whose last position is older than the active window', async () => {
    const { user } = await createUser()
    await UserPresence.create({
      user: user._id,
      location: { type: 'Point', coordinates: [10.9, 46.18] },
      updatedAt: new Date(Date.now() - ACTIVE_WINDOW_MS - 60 * 1000)
    })

    expect(await isUserActive(user._id)).toBe(false)
  })

  it('is false for a user who never sent a position', async () => {
    const { user } = await createUser()

    expect(await isUserActive(user._id)).toBe(false)
  })
})
