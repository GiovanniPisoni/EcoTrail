import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import User from './models/User.js'
import Trail from './models/Trail.js'

let mongod

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

describe('modelli base', () => {
  it('crea un utente valido', async () => {
    const user = await User.create({
      email: 'test@ecotrail.test',
      password: 'hashed',
      role: 'hiker',
    })
    expect(user.email).toBe('test@ecotrail.test')
    expect(user.role).toBe('hiker')
  })

  it('crea un sentiero valido', async () => {
    const trail = await Trail.create({
      name: 'Test trail',
      path: {
        type: 'LineString',
        coordinates: [
          [11, 44],
          [11.01, 44.01],
        ],
      },
    })
    expect(trail.status).toBe('free')
  })
})
