import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue()
  }
}))

let mongod
let app
let User

const JWT_SECRET = 'test-secret'

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET
  process.env.VAPID_SUBJECT = 'mailto:test@ecotrail.test'
  process.env.VAPID_PUBLIC_KEY = 'test-public-key'
  process.env.VAPID_PRIVATE_KEY = 'test-private-key'

  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())

  app = (await import('../src/index.js')).default
  User = (await import('../src/models/User.js')).default
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await User.deleteMany({})
})

async function createUserAndToken() {
  const user = await User.create({
    email: 'hiker@ecotrail.test',
    password: 'hashed',
    role: 'hiker'
  })
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  return { user, token }
}

describe('GET /api/push/public-key', () => {
  it('returns the configured VAPID public key', async () => {
    const res = await request(app).get('/api/push/public-key')
    expect(res.status).toBe(200)
    expect(res.body.publicKey).toBe('test-public-key')
  })
})

describe('POST /api/push/subscribe', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/push/subscribe').send({})
    expect(res.status).toBe(401)
  })

  it('saves a valid subscription on the logged-in user', async () => {
    const { user, token } = await createUserAndToken()

    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } })

    expect(res.status).toBe(201)

    const updated = await User.findById(user._id)
    expect(updated.pushSubscriptions).toHaveLength(1)
    expect(updated.pushSubscriptions[0].endpoint).toBe('https://push.test/a')
  })

  it('does not duplicate the same subscription on a second call', async () => {
    const { token } = await createUserAndToken()
    const body = { endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } }

    await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send(body)

    expect(res.status).toBe(201)
    const updated = await User.findOne({ email: 'hiker@ecotrail.test' })
    expect(updated.pushSubscriptions).toHaveLength(1)
  })

  it('rejects an incomplete subscription', async () => {
    const { token } = await createUserAndToken()
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://push.test/a' })

    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/push/subscribe', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).delete('/api/push/subscribe').send({})
    expect(res.status).toBe(401)
  })

  it('returns 400 when the endpoint is missing', async () => {
    const { token } = await createUserAndToken()
    const res = await request(app)
      .delete('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when the user has no such subscription', async () => {
    const { token } = await createUserAndToken()
    const res = await request(app)
      .delete('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://push.test/unknown' })
    expect(res.status).toBe(404)
  })

  it('removes only the matching subscription, leaving the others', async () => {
    const { user, token } = await createUserAndToken()
    await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } })
    await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://push.test/b', keys: { p256dh: 'x', auth: 'y' } })

    const res = await request(app)
      .delete('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://push.test/a' })

    expect(res.status).toBe(200)
    const updated = await User.findById(user._id)
    expect(updated.pushSubscriptions).toHaveLength(1)
    expect(updated.pushSubscriptions[0].endpoint).toBe('https://push.test/b')
  })
})

describe('POST /api/push/test', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/push/test')
    expect(res.status).toBe(401)
  })

  it('returns 400 when the user has no subscription', async () => {
    const { token } = await createUserAndToken()
    const res = await request(app).post('/api/push/test').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it('sends a push notification when the user has a subscription', async () => {
    const { token } = await createUserAndToken()
    await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } })

    const res = await request(app).post('/api/push/test').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const webpush = (await import('web-push')).default
    expect(webpush.sendNotification).toHaveBeenCalled()
  })
})
