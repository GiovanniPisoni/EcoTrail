import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }
}))

import api from '@/api/client.js'
import {
  alertsAreOn,
  forgetPushSubscription,
  subscribeToPush,
  syncPushSubscription,
  unsubscribeFromPush
} from '@/utils/push/pushSubscription.js'

const ENDPOINT = 'https://push.test/device'
const KEY = 'AQID'
const KEY_BYTES = Uint8Array.from([1, 2, 3])

let subscription
let pushManager
let storage
let dispatchEvent

function httpError(status) {
  return { response: { status } }
}

function abortError() {
  return Object.assign(new Error('Registration failed - push service error'), {
    name: 'AbortError'
  })
}

function stubBrowser({ permission = 'granted', existing = subscription } = {}) {
  pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existing),
    subscribe: vi.fn().mockResolvedValue(subscription)
  }
  dispatchEvent = vi.fn()
  vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager }) } })
  vi.stubGlobal('window', { PushManager: class {}, dispatchEvent })
  vi.stubGlobal('Notification', { permission })
}

function stubStorage(userId = 'user-1') {
  storage = new Map([['ecotrail_user', JSON.stringify({ id: userId })]])
  vi.stubGlobal('localStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  subscription = {
    endpoint: ENDPOINT,
    options: { applicationServerKey: KEY_BYTES },
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'x', auth: 'y' } }),
    unsubscribe: vi.fn().mockResolvedValue(true)
  }
  api.get.mockResolvedValue({ data: { publicKey: KEY } })
  api.post.mockResolvedValue({})
  stubStorage()
  stubBrowser()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('alertsAreOn', () => {
  it('is on when the device is allowed and subscribed', async () => {
    expect(await alertsAreOn()).toBe(true)
  })

  it('is off after the person turned the alerts off', async () => {
    await unsubscribeFromPush()

    expect(await alertsAreOn()).toBe(false)
  })

  it('stays on for another account on the same device', async () => {
    await unsubscribeFromPush()
    stubStorage('user-2')

    expect(await alertsAreOn()).toBe(true)
  })

  it('is off when the notifications are not allowed', async () => {
    stubBrowser({ permission: 'default' })

    expect(await alertsAreOn()).toBe(false)
  })

  it('is off when the browser has no subscription', async () => {
    stubBrowser({ existing: null })

    expect(await alertsAreOn()).toBe(false)
  })

  it('is off when push is not supported', async () => {
    vi.stubGlobal('navigator', {})

    expect(await alertsAreOn()).toBe(false)
  })
})

describe('subscribeToPush', () => {
  it('creates a subscription and registers it on the server', async () => {
    stubBrowser({ existing: null })

    expect(await subscribeToPush()).toBe(subscription)

    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: KEY_BYTES
    })
    expect(api.post).toHaveBeenCalledWith('/push/subscribe', subscription.toJSON())
  })

  it('reuses the subscription the browser already has for the same key', async () => {
    expect(await subscribeToPush()).toBe(subscription)

    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(api.post).toHaveBeenCalledWith('/push/subscribe', subscription.toJSON())
  })

  it('reuses a subscription whose key cannot be read', async () => {
    subscription.options = undefined
    stubBrowser()

    await subscribeToPush()

    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })

  it('replaces a subscription made with another key', async () => {
    subscription.options = { applicationServerKey: Uint8Array.from([9, 9]) }
    stubBrowser()

    await subscribeToPush()

    expect(subscription.unsubscribe).toHaveBeenCalled()
    expect(pushManager.subscribe).toHaveBeenCalled()
  })

  it('turns the alerts back on after they were turned off', async () => {
    await unsubscribeFromPush()

    await subscribeToPush()

    expect(await alertsAreOn()).toBe(true)
  })

  it('announces the change', async () => {
    await subscribeToPush()

    expect(dispatchEvent).toHaveBeenCalled()
  })

  it('tries again when the push service refuses the first time', async () => {
    vi.useFakeTimers()
    stubBrowser({ existing: null })
    pushManager.subscribe.mockRejectedValueOnce(abortError()).mockResolvedValue(subscription)

    const result = subscribeToPush()
    await vi.advanceTimersByTimeAsync(10000)

    expect(await result).toBe(subscription)
    expect(pushManager.subscribe).toHaveBeenCalledTimes(2)
  })

  it('gives up after three refusals and lets the error through', async () => {
    vi.useFakeTimers()
    stubBrowser({ existing: null })
    pushManager.subscribe.mockRejectedValue(abortError())

    const result = subscribeToPush().catch((err) => err)
    await vi.advanceTimersByTimeAsync(10000)

    expect((await result).name).toBe('AbortError')
    expect(pushManager.subscribe).toHaveBeenCalledTimes(3)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('does not try again for an error that is not a refusal', async () => {
    stubBrowser({ existing: null })
    pushManager.subscribe.mockRejectedValue(new Error('permission denied'))

    await expect(subscribeToPush()).rejects.toThrow('permission denied')

    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)
  })
})

describe('syncPushSubscription', () => {
  it('registers the subscription the browser already has for the current account', async () => {
    expect(await syncPushSubscription()).toBe(true)

    expect(api.post).toHaveBeenCalledWith('/push/subscribe', subscription.toJSON())
  })

  it('does nothing for an account that turned the alerts off', async () => {
    await unsubscribeFromPush()
    api.post.mockClear()

    expect(await syncPushSubscription()).toBe(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('does nothing when the person has not allowed notifications', async () => {
    stubBrowser({ permission: 'default' })

    expect(await syncPushSubscription()).toBe(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('does nothing when the browser has no subscription yet', async () => {
    stubBrowser({ existing: null })

    expect(await syncPushSubscription()).toBe(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('does nothing when push is not supported', async () => {
    vi.stubGlobal('navigator', {})

    expect(await syncPushSubscription()).toBe(false)
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('unsubscribeFromPush', () => {
  it('tells the server and keeps the subscription in the browser', async () => {
    await unsubscribeFromPush()

    expect(api.post).toHaveBeenCalledWith('/push/unsubscribe', { endpoint: ENDPOINT })
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })

  it.each([404, 401, 500])(
    'still turns the alerts off when the server answers %i',
    async (status) => {
      api.post.mockRejectedValue(httpError(status))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(unsubscribeFromPush()).resolves.toBeUndefined()

      expect(await alertsAreOn()).toBe(false)
    }
  )

  it('still turns the alerts off when the server cannot be reached', async () => {
    api.post.mockRejectedValue(new Error('Network Error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(unsubscribeFromPush()).resolves.toBeUndefined()

    expect(await alertsAreOn()).toBe(false)
  })

  it('announces the change, so the pages showing the state refresh', async () => {
    await unsubscribeFromPush()

    expect(dispatchEvent).toHaveBeenCalled()
  })

  it('turns the alerts off even when the browser has no subscription', async () => {
    stubBrowser({ existing: null })

    await unsubscribeFromPush()

    expect(api.post).not.toHaveBeenCalled()
    expect(dispatchEvent).toHaveBeenCalled()
  })
})

describe('forgetPushSubscription', () => {
  it('tells the server to stop alerting this device for the current account', async () => {
    await forgetPushSubscription()

    expect(api.post).toHaveBeenCalledWith('/push/unsubscribe', { endpoint: ENDPOINT })
  })

  it('keeps the browser subscription so the next account can claim it', async () => {
    await forgetPushSubscription()

    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })

  it.each([404, 401, 500])('never fails, even when the server answers %i', async (status) => {
    api.post.mockRejectedValue(httpError(status))

    await expect(forgetPushSubscription()).resolves.toBeUndefined()
  })

  it('never fails when push is not supported', async () => {
    vi.stubGlobal('navigator', {})

    await expect(forgetPushSubscription()).resolves.toBeUndefined()
    expect(api.post).not.toHaveBeenCalled()
  })
})
