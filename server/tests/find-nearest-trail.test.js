import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import Trail from '../src/models/Trail.js'
import { MAX_TRAIL_DISTANCE_METERS, findNearestTrail } from '../src/services/findNearestTrail.js'

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

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Trail.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Trail.deleteMany({})
})

describe('findNearestTrail', () => {
  it('uses a default maximum distance of 200 m', () => {
    expect(MAX_TRAIL_DISTANCE_METERS).toBe(200)
  })

  it('finds the trail when the position is exactly on it', async () => {
    const trail = await Trail.create(trailAt('Trail A', 46.18))

    const found = await findNearestTrail(46.18, 10.905)

    expect(found._id.equals(trail._id)).toBe(true)
    expect(found.name).toBe('Trail A')
  })

  it('finds the trail when the position is just inside the maximum distance (~190 m)', async () => {
    await Trail.create(trailAt('Trail A', 46.18))

    const found = await findNearestTrail(46.1817, 10.905)

    expect(found?.name).toBe('Trail A')
  })

  it('returns null when the position is just outside the maximum distance (~210 m)', async () => {
    await Trail.create(trailAt('Trail A', 46.18))

    expect(await findNearestTrail(46.1819, 10.905)).toBeNull()
  })

  it('returns null when there are no trails at all', async () => {
    expect(await findNearestTrail(46.18, 10.905)).toBeNull()
  })

  it('returns the closest trail when several are in range', async () => {
    await Trail.create([trailAt('Trail A', 46.18), trailAt('Trail C', 46.1815)])

    expect((await findNearestTrail(46.1805, 10.905)).name).toBe('Trail A')
    expect((await findNearestTrail(46.1811, 10.905)).name).toBe('Trail C')
  })

  it('ignores far away trails', async () => {
    await Trail.create([trailAt('Near', 46.18), trailAt('Far', 46.2)])

    expect((await findNearestTrail(46.2, 10.905)).name).toBe('Far')
    expect(await findNearestTrail(46.19, 10.905)).toBeNull()
  })

  it('accepts a custom maximum distance', async () => {
    await Trail.create(trailAt('Trail A', 46.18))

    expect(await findNearestTrail(46.1809, 10.905, 50)).toBeNull()
    expect((await findNearestTrail(46.1809, 10.905, 200)).name).toBe('Trail A')
  })
})
