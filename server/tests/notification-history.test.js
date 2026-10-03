import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn()
  }
}))

import webpush from 'web-push'
import User from '../src/models/User.js'
import Notification from '../src/models/Notification.js'
import { sendPush } from '../src/services/sendPush.js'

let mongod

beforeAll(async () => {
  process.env.VAPID_SUBJECT = 'mailto:test@ecotrail.test'
  process.env.VAPID_PUBLIC_KEY = 'test-public-key'
  process.env.VAPID_PRIVATE_KEY = 'test-private-key'

  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  vi.clearAllMocks()
  webpush.sendNotification.mockResolvedValue()
  await Promise.all([User.deleteMany({}), Notification.deleteMany({})])
})

function createUser(pushSubscriptions = []) {
  return User.create({ email: 'hiker@ecotrail.test', password: 'hashed', pushSubscriptions })
}

describe('sendPush notification history', () => {
  it('saves the notification when a type is given', async () => {
    const user = await createUser([
      { endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } }
    ])
    const trailId = new mongoose.Types.ObjectId()

    await sendPush(
      user,
      { title: 'Alert', body: 'Something happened', url: '/?trail=abc' },
      { type: 'emergency', trail: trailId }
    )

    const [saved] = await Notification.find({ user: user._id })
    expect(saved).toMatchObject({
      type: 'emergency',
      title: 'Alert',
      body: 'Something happened',
      url: '/?trail=abc',
      readAt: null
    })
    expect(saved.trail.equals(trailId)).toBe(true)
    expect(saved.sentAt).toBeInstanceOf(Date)
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('saves the notification even when the user has no subscription', async () => {
    const user = await createUser()

    await sendPush(user, { title: 'Alert' }, { type: 'approach' })

    expect(await Notification.countDocuments({ user: user._id })).toBe(1)
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('does not save anything when no type is given', async () => {
    const user = await createUser()

    await sendPush(user, { title: 'Test' })

    expect(await Notification.countDocuments()).toBe(0)
  })

  it('rejects an unknown notification type', async () => {
    const user = await createUser()

    await expect(sendPush(user, { title: 'Alert' }, { type: 'spam' })).rejects.toThrow()
  })
})
