import { describe, it, expect } from 'vitest'
import { buildPeriodParams, validateCustomRange } from '@/utils/statsPeriod.js'

describe('validateCustomRange', () => {
  it('requires a start date', () => {
    expect(validateCustomRange('', '')).not.toBe('')
  })

  it('rejects an end date before the start date', () => {
    expect(validateCustomRange('2026-10-08', '2026-10-01')).not.toBe('')
  })

  it('accepts a single date and a valid range', () => {
    expect(validateCustomRange('2026-10-08', '')).toBe('')
    expect(validateCustomRange('2026-10-01', '2026-10-08')).toBe('')
  })
})

describe('buildPeriodParams', () => {
  it('uses the number of days for presets', () => {
    expect(buildPeriodParams({ mode: 'preset', days: 30 })).toEqual({ days: 30 })
  })

  it('sends only the start date when no end date is chosen', () => {
    expect(buildPeriodParams({ mode: 'custom', from: '2026-10-08', to: '' })).toEqual({
      from: '2026-10-08'
    })
  })

  it('sends both dates for a range', () => {
    expect(buildPeriodParams({ mode: 'custom', from: '2026-10-01', to: '2026-10-08' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-08'
    })
  })

  it('returns null for an invalid custom range', () => {
    expect(buildPeriodParams({ mode: 'custom', from: '', to: '' })).toBeNull()
    expect(buildPeriodParams({ mode: 'custom', from: '2026-10-08', to: '2026-10-01' })).toBeNull()
  })
})
