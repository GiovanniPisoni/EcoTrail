import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }
}))

import api from '@/api/client.js'
import {
  forgetPushSubscription,
  subscribeToPush,
  syncPushSubscription,
  unsubscribeFromPush
} from '@/utils/push/pushSubscription.js'

const ENDPOINT = 'https://push.test/device'

let subscription
let pushManager

function httpError(status) {
  return { response: { status } }
}

function stubBrowser({ permission = 'granted', existing = subscription } = {}) {
  pushManager = { getSubscription: vi.fn().mockResolvedValue(existing) }
  vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager }) } })
  vi.stubGlobal('window', { PushManager: class {}, dispatchEvent: vi.fn() })
  vi.stubGlobal('Notification', { permission })
}

beforeEach(() => {
  vi.clearAllMocks()
  subscription = {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'x', auth: 'y' } }),
    unsubscribe: vi.fn().mockResolvedValue(true)
  }
  api.post.mockResolvedValue({})
  api.delete.mockResolvedValue({})
  stubBrowser()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('subscribeToPush', () => {
  const KEY = 'AQID'
  const keyBytes = [1, 2, 3]

  beforeEach(() => {
    api.get.mockResolvedValue({ data: { publicKey: KEY } })
  })

  function registrationWith(existing) {
    const created = {
      endpoint: 'https://push.test/new',
      toJSON: () => ({ endpoint: 'https://push.test/new', keys: { p256dh: 'x', auth: 'y' } })
    }
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(existing),
      subscribe: vi.fn().mockResolvedValue(created)
    }
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager }) } })
    return { pushManager, created }
  }

  it('creates a subscription and registers it on the server', async () => {
    const { pushManager, created } = registrationWith(null)

    expect(await subscribeToPush()).toBe(created)

    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from(keyBytes)
    })
    expect(api.post).toHaveBeenCalledWith('/push/subscribe', {
      endpoint: 'https://push.test/new',
      keys: { p256dh: 'x', auth: 'y' }
    })
  })

  it('reuses the subscription the browser already has for the same key', async () => {
    const existing = {
      ...subscription,
      options: { applicationServerKey: Uint8Array.from(keyBytes) }
    }
    const { pushManager } = registrationWith(existing)

    expect(await subscribeToPush()).toBe(existing)

    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(api.post).toHaveBeenCalledWith('/push/subscribe', existing.toJSON())
  })

  it('replaces a subscription made with another key', async () => {
    const existing = { ...subscription, options: { applicationServerKey: Uint8Array.from([9, 9]) } }
    const { pushManager, created } = registrationWith(existing)

    expect(await subscribeToPush()).toBe(created)

    expect(existing.unsubscribe).toHaveBeenCalled()
    expect(pushManager.subscribe).toHaveBeenCalled()
  })

  it('lets the error through when the browser cannot subscribe', async () => {
    const { pushManager } = registrationWith(null)
    pushManager.subscribe.mockRejectedValue(new Error('push service error'))

    await expect(subscribeToPush()).rejects.toThrow('push service error')
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('syncPushSubscription', () => {
  it('registers the subscription the browser already has for the current account', async () => {
    expect(await syncPushSubscription()).toBe(true)

    expect(api.post).toHaveBeenCalledWith('/push/subscribe', {
      endpoint: ENDPOINT,
      keys: { p256dh: 'x', auth: 'y' }
    })
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
  it('tells the server and removes the subscription from the browser', async () => {
    await unsubscribeFromPush()

    expect(api.post).toHaveBeenCalledWith('/push/unsubscribe', { endpoint: ENDPOINT })
    expect(subscription.unsubscribe).toHaveBeenCalled()
  })

  it.each([404, 401, 500])(
    'still turns alerts off in the browser when the server answers %i',
    async (status) => {
      api.post.mockRejectedValue(httpError(status))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(unsubscribeFromPush()).resolves.toBeUndefined()

      expect(subscription.unsubscribe).toHaveBeenCalled()
    }
  )

  it('still turns alerts off when the server cannot be reached', async () => {
    api.post.mockRejectedValue(new Error('Network Error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(unsubscribeFromPush()).resolves.toBeUndefined()

    expect(subscription.unsubscribe).toHaveBeenCalled()
  })

  it('announces the change, so the pages showing the state refresh', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { PushManager: class {}, dispatchEvent })

    await unsubscribeFromPush()

    expect(dispatchEvent).toHaveBeenCalled()
  })

  it('does nothing when there is no subscription', async () => {
    stubBrowser({ existing: null })

    await unsubscribeFromPush()

    expect(api.post).not.toHaveBeenCalled()
    expect(api.delete).not.toHaveBeenCalled()
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
    expect(api.delete).not.toHaveBeenCalled()
  })
})
