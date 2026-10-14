import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../src/index.js'
import User from '../../src/models/User.js'

const JWT_SECRET = 'test-secret'

let mongod
let user
let token

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
  await User.deleteMany({})
  user = await User.create({ email: 'visitor@esempio.it', password: 'hashed' })
  token = jwt.sign({ id: user._id, role: 'hiker' }, JWT_SECRET, { expiresIn: '7d' })
})

function asVisitor(method, path) {
  return request(app)[method](path).set('Authorization', `Bearer ${token}`)
}

describe('a valid token of an account that was deleted', () => {
  it('works while the account exists', async () => {
    const res = await asVisitor('get', '/api/notifications/preferences')

    expect(res.status).toBe(200)
  })

  it.each([
    ['get', '/api/notifications/preferences'],
    ['get', '/api/notifications'],
    ['get', '/api/reports/me'],
    ['post', '/api/push/subscribe'],
    ['post', '/api/push/unsubscribe'],
    ['post', '/api/presence']
  ])('is refused with 401 on %s %s', async (method, path) => {
    await User.deleteOne({ _id: user._id })

    const res = await asVisitor(method, path).send({})

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('This account no longer exists')
  })
})
