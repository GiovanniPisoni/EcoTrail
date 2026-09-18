import { describe, it, expect, vi, beforeAll } from 'vitest'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

let webpush
let sendPush

beforeAll(async () => {
  process.env.VAPID_SUBJECT = 'mailto:test@ecotrail.test'
  process.env.VAPID_PUBLIC_KEY = 'test-public-key'
  process.env.VAPID_PRIVATE_KEY = 'test-private-key'

  webpush = (await import('web-push')).default
  ;({ sendPush } = await import('../src/services/sendPush.js'))
})

function fakeUser(subscriptions) {
  return {
    pushSubscriptions: subscriptions,
    save: vi.fn(async function () {}),
  }
}

describe('sendPush', () => {
  it('sends a notification to every subscription', async () => {
    webpush.sendNotification.mockResolvedValue()
    const user = fakeUser([{ endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } }])

    await sendPush(user, { title: 'Test' })

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
    expect(user.save).not.toHaveBeenCalled()
  })

  it('removes a subscription when the push service reports it is gone (410)', async () => {
    webpush.sendNotification
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }))

    const user = fakeUser([
      { endpoint: 'https://push.test/valid', keys: { p256dh: 'x', auth: 'y' } },
      { endpoint: 'https://push.test/expired', keys: { p256dh: 'x', auth: 'y' } },
    ])

    await sendPush(user, { title: 'Test' })

    expect(user.pushSubscriptions).toHaveLength(1)
    expect(user.pushSubscriptions[0].endpoint).toBe('https://push.test/valid')
    expect(user.save).toHaveBeenCalledTimes(1)
  })

  it('propagates unexpected errors instead of silently dropping the subscription', async () => {
    webpush.sendNotification.mockRejectedValueOnce(Object.assign(new Error('Boom'), { statusCode: 500 }))
    const user = fakeUser([{ endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } }])

    await expect(sendPush(user, { title: 'Test' })).rejects.toThrow('Boom')
  })
})
