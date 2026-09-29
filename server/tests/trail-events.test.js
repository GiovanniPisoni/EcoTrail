import { describe, it, expect, vi, afterEach } from 'vitest'
import { TRAIL_STATUS_CHANGED, trailEvents } from '../src/services/trailEvents.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('trailEvents', () => {
  it('logs the status change when the event is emitted', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    trailEvents.emit(TRAIL_STATUS_CHANGED, {
      trailId: 'trail-1',
      trailName: 'Sentiero delle Grotte',
      previousStatus: 'free',
      newStatus: 'at_risk',
      reason: 'Rockfall reported',
      changedBy: 'user-1',
    })

    expect(logSpy).toHaveBeenCalledTimes(1)
    const [message] = logSpy.mock.calls[0]
    expect(message).toContain('Sentiero delle Grotte')
    expect(message).toContain('free -> at_risk')
    expect(message).toContain('Rockfall reported')
  })

  it('does not log anything for an unrelated event', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    trailEvents.emit('some:other-event', {})

    expect(logSpy).not.toHaveBeenCalled()
  })

  it('supports more than one listener, e.g. the future push notification handler', () => {
    const extraListener = vi.fn()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    trailEvents.on(TRAIL_STATUS_CHANGED, extraListener)

    trailEvents.emit(TRAIL_STATUS_CHANGED, {
      trailId: 'trail-1',
      trailName: 'Test trail',
      previousStatus: 'free',
      newStatus: 'closed',
      reason: 'Test',
      changedBy: 'user-1',
    })

    expect(extraListener).toHaveBeenCalledTimes(1)
    trailEvents.off(TRAIL_STATUS_CHANGED, extraListener)
  })
})
