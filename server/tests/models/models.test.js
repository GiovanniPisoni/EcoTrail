import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import User from '../../src/models/User.js'
import Trail from '../../src/models/Trail.js'
import Report from '../../src/models/Report.js'

let mongod

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

describe('base models', () => {
  it('creates a valid user', async () => {
    const user = await User.create({
      email: 'test@ecotrail.test',
      password: 'hashed',
      role: 'hiker'
    })
    expect(user.email).toBe('test@ecotrail.test')
    expect(user.role).toBe('hiker')
  })

  it('creates a valid trail', async () => {
    const trail = await Trail.create({
      name: 'Test trail',
      path: {
        type: 'LineString',
        coordinates: [
          [11, 44],
          [11.01, 44.01]
        ]
      }
    })
    expect(trail.status).toBe('free')
    expect(trail.distanceKm).toBeUndefined()
    expect(trail.difficulty).toBeUndefined()
  })

  it('stores the optional distance, duration, difficulty and photo of a trail', async () => {
    const trail = await Trail.create({
      name: 'Trail with details',
      path: {
        type: 'LineString',
        coordinates: [
          [11, 44],
          [11.01, 44.01]
        ]
      },
      distanceKm: 4.2,
      durationMinutes: 90,
      difficulty: 'medium',
      photoUrl: '/images/trail-placeholder.jpg'
    })

    const saved = await Trail.findById(trail._id)
    expect(saved.distanceKm).toBe(4.2)
    expect(saved.durationMinutes).toBe(90)
    expect(saved.difficulty).toBe('medium')
    expect(saved.photoUrl).toBe('/images/trail-placeholder.jpg')
  })

  it('rejects a trail with an invalid difficulty or a negative distance', async () => {
    const path = {
      type: 'LineString',
      coordinates: [
        [11, 44],
        [11.01, 44.01]
      ]
    }

    await expect(
      Trail.create({ name: 'Bad difficulty', path, difficulty: 'extreme' })
    ).rejects.toThrow()
    await expect(Trail.create({ name: 'Bad distance', path, distanceKm: -1 })).rejects.toThrow()
  })

  it('creates a valid report, linked to a user and a trail', async () => {
    const author = await User.create({
      email: 'author@ecotrail.test',
      password: 'hashed',
      role: 'hiker'
    })
    const trail = await Trail.create({
      name: 'Test trail for report',
      path: {
        type: 'LineString',
        coordinates: [
          [11, 44],
          [11.01, 44.01]
        ]
      }
    })

    const report = await Report.create({
      author: author._id,
      type: 'fallen_tree',
      severity: 'medium',
      location: { type: 'Point', coordinates: [11.005, 44.005] },
      trail: trail._id
    })

    expect(report.validationStatus).toBe('pending')
    expect(report.trustScore).toBe(0)
    expect(report.isSuspicious).toBe(false)
  })
})
