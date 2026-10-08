import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PERIOD_DAYS,
  MAX_PERIOD_DAYS,
  parsePeriod,
  zonedMidnight
} from '../../src/services/statsPeriod.js'

const NOW = new Date('2026-10-08T10:00:00Z')

describe('zonedMidnight', () => {
  it('uses the summer offset in October', () => {
    expect(zonedMidnight(2026, 10, 8).toISOString()).toBe('2026-10-07T22:00:00.000Z')
  })

  it('uses the winter offset in January', () => {
    expect(zonedMidnight(2026, 1, 15).toISOString()).toBe('2026-01-14T23:00:00.000Z')
  })

  it('follows the daylight saving change at the end of October', () => {
    expect(zonedMidnight(2026, 10, 25).toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(zonedMidnight(2026, 10, 26).toISOString()).toBe('2026-10-25T23:00:00.000Z')
  })
})

describe('parsePeriod', () => {
  it('defaults to the last 7 days', () => {
    const { value } = parsePeriod({}, NOW)

    expect(value.end).toEqual(NOW)
    expect(NOW - value.start).toBe(DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000)
  })

  it('accepts a custom number of days', () => {
    const { value } = parsePeriod({ days: '30' }, NOW)

    expect(NOW - value.start).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('treats a single date as that whole day', () => {
    const { value } = parsePeriod({ from: '2026-10-08' }, NOW)

    expect(value.start.toISOString()).toBe('2026-10-07T22:00:00.000Z')
    expect(value.end.toISOString()).toBe('2026-10-08T22:00:00.000Z')
  })

  it('includes the last day of a date range', () => {
    const { value } = parsePeriod({ from: '2026-10-01', to: '2026-10-08' }, NOW)

    expect(value.start.toISOString()).toBe('2026-09-30T22:00:00.000Z')
    expect(value.end.toISOString()).toBe('2026-10-08T22:00:00.000Z')
  })

  it.each([
    [{ days: '0' }],
    [{ days: 'abc' }],
    [{ days: String(MAX_PERIOD_DAYS + 1) }],
    [{ from: '08/10/2026' }],
    [{ from: '2026-02-30' }],
    [{ to: '2026-10-08' }],
    [{ from: '2026-10-08', to: '2026-10-01' }],
    [{ from: '2025-01-01', to: '2026-10-08' }]
  ])('rejects invalid input %j', (query) => {
    expect(parsePeriod(query, NOW).error).toBeTruthy()
  })
})
