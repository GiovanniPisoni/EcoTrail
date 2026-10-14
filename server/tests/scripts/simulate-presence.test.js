import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import User from '../../src/models/User.js'
import Trail from '../../src/models/Trail.js'
import UserPresence from '../../src/models/UserPresence.js'
import { findNearbyUsers } from '../../src/services/presence/findNearbyUsers.js'
import { DEFAULT_TRAIL, placeUserOnTrail } from '../../scripts/simulate/presence.js'

let mongod
let user
let trail

const path = {
  type: 'LineString',
  coordinates: [
    [10.9, 46.18],
    [10.91, 46.18],
    [10.92, 46.18]
  ]
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await UserPresence.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Trail.deleteMany({}), UserPresence.deleteMany({})])
  user = await User.create({ email: 'p1@esempio.it', password: 'h' })
  trail = await Trail.create({ name: DEFAULT_TRAIL, path })
})

describe('placeUserOnTrail', () => {
  it('puts the account in the middle of the trail', async () => {
    const placed = await placeUserOnTrail({ email: 'p1@esempio.it' })

    expect(placed).toMatchObject({ email: 'p1@esempio.it', trail: DEFAULT_TRAIL })
    const presence = await UserPresence.findOne({ user: user._id })
    expect(presence.location.coordinates).toEqual([10.91, 46.18])
  })

  it('makes the account count as near the trail, so it gets the alerts', async () => {
    await placeUserOnTrail({ email: 'p1@esempio.it' })

    const nearby = await findNearbyUsers(trail.path, { radiusMeters: 500 })

    expect(nearby.map((match) => String(match.userId))).toEqual([String(user._id)])
  })

  it('finds the account whatever the case of the email', async () => {
    await placeUserOnTrail({ email: ' P1@Esempio.IT ' })

    expect(await UserPresence.countDocuments()).toBe(1)
  })

  it('replaces the previous position instead of adding another', async () => {
    await placeUserOnTrail({ email: 'p1@esempio.it' })
    await placeUserOnTrail({ email: 'p1@esempio.it' })

    expect(await UserPresence.countDocuments()).toBe(1)
  })

  it('can use another trail', async () => {
    await Trail.create({
      name: 'Lago',
      path: {
        type: 'LineString',
        coordinates: [
          [11.0, 46.3],
          [11.02, 46.3]
        ]
      }
    })

    const placed = await placeUserOnTrail({ email: 'p1@esempio.it', trailName: 'Lago' })

    expect(placed.trail).toBe('Lago')
    expect(placed.longitude).toBe(11.02)
  })

  it('refuses an unknown account or trail and saves nothing', async () => {
    await expect(placeUserOnTrail({ email: 'nobody@esempio.it' })).rejects.toThrow('No account')
    await expect(
      placeUserOnTrail({ email: 'p1@esempio.it', trailName: 'Nowhere' })
    ).rejects.toThrow('No trail')

    expect(await UserPresence.countDocuments()).toBe(0)
  })
})
