import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import bcrypt from 'bcrypt'
import app from '../src/index.js'
import User from '../src/models/User.js'

let mongod

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await User.deleteMany({})
})

describe('POST /api/auth/register', () => {
  it('creates a new hiker account', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@ecotrail.test', password: 'password123' })

    expect(res.status).toBe(201)
    expect(res.body.role).toBe('hiker')
  })

  it('rejects a duplicate email', async () => {
    await User.create({ email: 'dup@ecotrail.test', password: 'hashed', role: 'hiker' })

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@ecotrail.test', password: 'password123' })

    expect(res.status).toBe(409)
  })
})

describe('POST /api/auth/login', () => {
  it('returns a token for valid credentials', async () => {
    const hashed = await bcrypt.hash('password123', 10)
    await User.create({ email: 'login@ecotrail.test', password: hashed, role: 'hiker' })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@ecotrail.test', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
  })

  it('rejects a wrong password with a generic error message', async () => {
    const hashed = await bcrypt.hash('password123', 10)
    await User.create({ email: 'login2@ecotrail.test', password: hashed, role: 'hiker' })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login2@ecotrail.test', password: 'wrong-password' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid credentials')
  })

  it('rejects an unknown email with the same generic error message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'doesnotexist@ecotrail.test', password: 'whatever' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid credentials')
  })
})

describe('GET /api/auth/me', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('returns the real user data from the database, not just the token payload', async () => {
    const hashed = await bcrypt.hash('password123', 10)
    const user = await User.create({
      email: 'profile@ecotrail.test',
      password: hashed,
      role: 'hiker',
      reputation: 7,
    })

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'profile@ecotrail.test', password: 'password123' })

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: user._id.toString(),
      email: 'profile@ecotrail.test',
      role: 'hiker',
      reputation: 7,
    })
  })
})
