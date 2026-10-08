import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import Trail from '../../src/models/Trail.js'
import TrailActivity from '../../src/models/TrailActivity.js'
import {
  addTrailVisitor,
  recordTrailActivity,
  startOfHour
} from '../../src/services/trailActivity.js'

let mongod
let trail

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Trail.init()
  await TrailActivity.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([Trail.deleteMany({}), TrailActivity.deleteMany({})])
  trail = await Trail.create({
    name: 'Sentiero Test',
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, 46.18],
        [10.91, 46.18]
      ]
    }
  })
})

describe('startOfHour', () => {
  it('rounds a date down to the start of its hour', () => {
    expect(startOfHour(new Date('2026-10-08T14:37:12.500Z')).toISOString()).toBe(
      '2026-10-08T14:00:00.000Z'
    )
  })
})

describe('addTrailVisitor', () => {
  it('counts the same user once per trail and hour', async () => {
    const userId = new mongoose.Types.ObjectId()
    const at = new Date('2026-10-08T14:05:00Z')

    await addTrailVisitor(trail._id, userId, at)
    await addTrailVisitor(trail._id, userId, new Date('2026-10-08T14:50:00Z'))

    const buckets = await TrailActivity.find({ trail: trail._id })
    expect(buckets).toHaveLength(1)
    expect(buckets[0].users).toHaveLength(1)
  })

  it('counts different users and different hours separately', async () => {
    const first = new mongoose.Types.ObjectId()
    const second = new mongoose.Types.ObjectId()

    await addTrailVisitor(trail._id, first, new Date('2026-10-08T14:05:00Z'))
    await addTrailVisitor(trail._id, second, new Date('2026-10-08T14:20:00Z'))
    await addTrailVisitor(trail._id, first, new Date('2026-10-08T15:01:00Z'))

    const buckets = await TrailActivity.find({ trail: trail._id }).sort({ hour: 1 })
    expect(buckets.map((bucket) => bucket.users.length)).toEqual([2, 1])
  })

  it('does not lose visitors when updates arrive concurrently', async () => {
    const users = Array.from({ length: 8 }, () => new mongoose.Types.ObjectId())
    const at = new Date('2026-10-08T09:10:00Z')

    await Promise.all(users.map((userId) => addTrailVisitor(trail._id, userId, at)))

    const bucket = await TrailActivity.findOne({ trail: trail._id })
    expect(bucket.users).toHaveLength(users.length)
  })
})

describe('recordTrailActivity', () => {
  it('records the visit on the trail nearest to the position', async () => {
    const userId = new mongoose.Types.ObjectId()

    const result = await recordTrailActivity(userId, { latitude: 46.18, longitude: 10.905 })

    expect(String(result._id)).toBe(String(trail._id))
    expect(await TrailActivity.countDocuments({ trail: trail._id })).toBe(1)
  })

  it('records nothing when no trail is close enough', async () => {
    const userId = new mongoose.Types.ObjectId()

    const result = await recordTrailActivity(userId, { latitude: 40, longitude: 8 })

    expect(result).toBeNull()
    expect(await TrailActivity.countDocuments()).toBe(0)
  })
})
