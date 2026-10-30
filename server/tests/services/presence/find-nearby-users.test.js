import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import UserPresence from '../../../src/models/UserPresence.js'
import {
  DEFAULT_SEARCH_RADIUS_METERS,
  distanceToLineMeters,
  findNearbyUsers
} from '../../../src/services/presence/findNearbyUsers.js'

let mongod

const POINT = { type: 'Point', coordinates: [10.9, 46.18] }

async function createPresence(latitude, longitude, minutesAgo = 0) {
  const user = new mongoose.Types.ObjectId()
  await UserPresence.create({
    user,
    location: { type: 'Point', coordinates: [longitude, latitude] },
    updatedAt: new Date(Date.now() - minutesAgo * 60 * 1000)
  })
  return user
}

function ids(matches) {
  return matches.map((match) => match.userId.toString())
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
  await UserPresence.deleteMany({})
})

describe('findNearbyUsers around a point', () => {
  it('uses a default radius of 1000 m', () => {
    expect(DEFAULT_SEARCH_RADIUS_METERS).toBe(1000)
  })

  it('finds all and only the active users within the radius, closest first', async () => {
    const onTheSpot = await createPresence(46.18, 10.9)
    const near = await createPresence(46.1845, 10.9)
    await createPresence(46.1935, 10.9)

    const matches = await findNearbyUsers(POINT)

    expect(ids(matches)).toEqual([onTheSpot.toString(), near.toString()])
    expect(matches[0].distanceMeters).toBeLessThan(1)
    expect(matches[1].distanceMeters).toBeGreaterThan(450)
    expect(matches[1].distanceMeters).toBeLessThan(550)
  })

  it('respects a custom radius', async () => {
    const close = await createPresence(46.1809, 10.9)
    await createPresence(46.1845, 10.9)

    const matches = await findNearbyUsers(POINT, { radiusMeters: 200 })

    expect(ids(matches)).toEqual([close.toString()])
  })

  it('ignores users whose last position is too old', async () => {
    const fresh = await createPresence(46.1805, 10.9, 1)
    await createPresence(46.1805, 10.9, 16)

    const matches = await findNearbyUsers(POINT)

    expect(ids(matches)).toEqual([fresh.toString()])
  })

  it('returns an empty list when nobody is around', async () => {
    await createPresence(47, 11)

    expect(await findNearbyUsers(POINT)).toEqual([])
  })
})

describe('findNearbyUsers along a trail', () => {
  const TRAIL = {
    type: 'LineString',
    coordinates: [
      [10.8, 46.18],
      [11, 46.18]
    ]
  }

  it('finds users near the trail even when they are far from its vertices', async () => {
    const middle = await createPresence(46.1818, 10.9)

    const matches = await findNearbyUsers(TRAIL, { radiusMeters: 500 })

    expect(ids(matches)).toEqual([middle.toString()])
    expect(matches[0].distanceMeters).toBeGreaterThan(150)
    expect(matches[0].distanceMeters).toBeLessThan(250)
  })

  it('finds users just past the end of the trail when within the radius', async () => {
    const pastTheEnd = await createPresence(46.18, 11.004)

    const matches = await findNearbyUsers(TRAIL, { radiusMeters: 500 })

    expect(ids(matches)).toEqual([pastTheEnd.toString()])
  })

  it('excludes users farther than the radius from every part of the trail', async () => {
    await createPresence(46.19, 10.9)
    await createPresence(46.18, 11.02)

    expect(await findNearbyUsers(TRAIL, { radiusMeters: 500 })).toEqual([])
  })

  it('finds users along a bent trail and sorts them by distance', async () => {
    const bent = {
      type: 'LineString',
      coordinates: [
        [10.9, 46.18],
        [10.91, 46.18],
        [10.91, 46.19]
      ]
    }
    const farther = await createPresence(46.185, 10.9145)
    const closer = await createPresence(46.185, 10.9108)
    await createPresence(46.185, 10.93)

    const matches = await findNearbyUsers(bent, { radiusMeters: 500 })

    expect(ids(matches)).toEqual([closer.toString(), farther.toString()])
  })

  it('ignores users with an expired position even when they are on the trail', async () => {
    await createPresence(46.18, 10.9, 20)

    expect(await findNearbyUsers(TRAIL, { radiusMeters: 500 })).toEqual([])
  })
})

describe('findNearbyUsers input checks', () => {
  it('rejects geometries other than a point or a line', async () => {
    const polygon = { type: 'Polygon', coordinates: [] }

    await expect(findNearbyUsers(polygon)).rejects.toThrow(TypeError)
    await expect(findNearbyUsers(undefined)).rejects.toThrow(TypeError)
  })

  it('rejects a radius that is not a positive number', async () => {
    await expect(findNearbyUsers(POINT, { radiusMeters: 0 })).rejects.toThrow(RangeError)
    await expect(findNearbyUsers(POINT, { radiusMeters: -5 })).rejects.toThrow(RangeError)
    await expect(findNearbyUsers(POINT, { radiusMeters: 'far' })).rejects.toThrow(RangeError)
  })
})

describe('distanceToLineMeters', () => {
  it('measures the distance to the closest point of a segment, not only to its vertices', () => {
    const line = [
      [10.8, 46.18],
      [11, 46.18]
    ]

    const distance = distanceToLineMeters([10.9, 46.1818], line)

    expect(distance).toBeGreaterThan(190)
    expect(distance).toBeLessThan(210)
  })

  it('is zero for a point on the line', () => {
    const line = [
      [10.8, 46.18],
      [11, 46.18]
    ]

    expect(distanceToLineMeters([10.9, 46.18], line)).toBeCloseTo(0, 3)
  })
})
