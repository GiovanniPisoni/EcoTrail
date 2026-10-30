import { describe, it, expect, vi, beforeAll } from 'vitest'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn()
  }
}))

let webpush
let sendPush

beforeAll(async () => {
  process.env.VAPID_SUBJECT = 'mailto:test@ecotrail.test'
  process.env.VAPID_PUBLIC_KEY = 'test-public-key'
  process.env.VAPID_PRIVATE_KEY = 'test-private-key'

  webpush = (await import('web-push')).default
  ;({ sendPush } = await import('../../../src/services/notifications/sendPush.js'))
})

function fakeUser(subscriptions) {
  return {
    pushSubscriptions: subscriptions,
    save: vi.fn(async function () {})
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
      { endpoint: 'https://push.test/expired', keys: { p256dh: 'x', auth: 'y' } }
    ])

    await sendPush(user, { title: 'Test' })

    expect(user.pushSubscriptions).toHaveLength(1)
    expect(user.pushSubscriptions[0].endpoint).toBe('https://push.test/valid')
    expect(user.save).toHaveBeenCalledTimes(1)
  })

  it('propagates unexpected errors instead of silently dropping the subscription', async () => {
    webpush.sendNotification.mockRejectedValueOnce(
      Object.assign(new Error('Boom'), { statusCode: 500 })
    )
    const user = fakeUser([{ endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } }])

    await expect(sendPush(user, { title: 'Test' })).rejects.toThrow('Boom')
  })

  it('keeps sending to the other devices when one of them fails', async () => {
    webpush.sendNotification
      .mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
      .mockResolvedValueOnce()
    const user = fakeUser([
      { endpoint: 'https://broken.push.test/a', keys: { p256dh: 'x', auth: 'y' } },
      { endpoint: 'https://working.push.test/b', keys: { p256dh: 'x', auth: 'y' } }
    ])

    const results = await sendPush(user, { title: 'Test' })

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
    expect(results).toEqual([
      { host: 'broken.push.test', ok: false, statusCode: 401 },
      { host: 'working.push.test', ok: true }
    ])
  })

  it('keeps the device that failed, since the error may be temporary', async () => {
    webpush.sendNotification
      .mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { statusCode: 503 }))
      .mockResolvedValueOnce()
    const user = fakeUser([
      { endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } },
      { endpoint: 'https://push.test/b', keys: { p256dh: 'x', auth: 'y' } }
    ])

    await sendPush(user, { title: 'Test' })

    expect(user.pushSubscriptions).toHaveLength(2)
    expect(user.save).not.toHaveBeenCalled()
  })

  it('removes the expired device and still reaches the others', async () => {
    webpush.sendNotification
      .mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }))
      .mockResolvedValueOnce()
    const user = fakeUser([
      { endpoint: 'https://push.test/old', keys: { p256dh: 'x', auth: 'y' } },
      { endpoint: 'https://push.test/new', keys: { p256dh: 'x', auth: 'y' } }
    ])

    await sendPush(user, { title: 'Test' })

    expect(user.pushSubscriptions.map((sub) => sub.endpoint)).toEqual(['https://push.test/new'])
  })

  it('throws, with the result of every device, when nothing was delivered', async () => {
    webpush.sendNotification
      .mockRejectedValueOnce(
        Object.assign(new Error('Forbidden'), { statusCode: 403, body: 'bad key' })
      )
      .mockRejectedValueOnce(Object.assign(new Error('Boom'), { statusCode: 500 }))
    const user = fakeUser([
      { endpoint: 'https://a.push.test/1', keys: { p256dh: 'x', auth: 'y' } },
      { endpoint: 'https://b.push.test/2', keys: { p256dh: 'x', auth: 'y' } }
    ])

    const error = await sendPush(user, { title: 'Test' }).catch((err) => err)

    expect(error.message).toBe('Boom')
    expect(error.results).toEqual([
      { host: 'a.push.test', ok: false, statusCode: 403, detail: 'bad key' },
      { host: 'b.push.test', ok: false, statusCode: 500 }
    ])
  })

  it('does not throw when every device has expired', async () => {
    webpush.sendNotification.mockRejectedValue(
      Object.assign(new Error('Gone'), { statusCode: 404 })
    )
    const user = fakeUser([{ endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' } }])

    await expect(sendPush(user, { title: 'Test' })).resolves.toHaveLength(1)
    expect(user.pushSubscriptions).toHaveLength(0)
  })
})
