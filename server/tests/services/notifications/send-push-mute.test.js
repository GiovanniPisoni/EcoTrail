import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn()
  }
}))

import webpush from 'web-push'
import User from '../../../src/models/User.js'
import Notification from '../../../src/models/Notification.js'
import { sendPush } from '../../../src/services/notifications/sendPush.js'
import { MUTED_INDEFINITELY_UNTIL } from '../../../src/config/notificationPreferences.js'

let mongod
const PAYLOAD = { title: 'EcoTrail alert', body: 'Trail closed', url: '/?trail=abc' }

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
  await Promise.all([User.deleteMany({}), Notification.deleteMany({})])
  webpush.sendNotification.mockReset()
  webpush.sendNotification.mockResolvedValue()
})

function createHiker(mutedUntil) {
  return User.create({
    email: 'hiker@ecotrail.test',
    password: 'hashed',
    pushSubscriptions: [{ endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } }],
    notificationPreferences: { mutedUntil }
  })
}

describe('sendPush while the user has muted alerts', () => {
  it('sends the push when the user has not muted anything', async () => {
    const user = await createHiker(null)

    await sendPush(user, PAYLOAD, { type: 'emergency' })

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('does not push to a muted user, but keeps the alert in their history', async () => {
    const user = await createHiker(new Date(Date.now() + 60 * 60 * 1000))

    await sendPush(user, PAYLOAD, { type: 'emergency' })

    expect(webpush.sendNotification).not.toHaveBeenCalled()
    const stored = await Notification.find({ user: user._id })
    expect(stored).toHaveLength(1)
    expect(stored[0].type).toBe('emergency')
    expect(stored[0].readAt).toBeNull()
  })

  it('does not push to a user who muted alerts until they turn them back on', async () => {
    const user = await createHiker(MUTED_INDEFINITELY_UNTIL)

    await sendPush(user, PAYLOAD, { type: 'approach' })

    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('pushes again once the mute has ended', async () => {
    const user = await createHiker(new Date(Date.now() - 60 * 1000))

    await sendPush(user, PAYLOAD, { type: 'emergency' })

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('still sends a notification that is not an alert, such as the test push', async () => {
    const user = await createHiker(MUTED_INDEFINITELY_UNTIL)

    await sendPush(user, { title: 'EcoTrail', body: 'Test' })

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
    expect(await Notification.countDocuments()).toBe(0)
  })
})
