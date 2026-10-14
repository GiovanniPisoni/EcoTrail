import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }
}))

import api from '@/api/client.js'
import {
  forgetPushSubscription,
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
