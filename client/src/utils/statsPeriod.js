export const PERIOD_PRESETS = [
  { days: 1, label: '24 hours' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' }
]

export const DEFAULT_PRESET_DAYS = 7

export function validateCustomRange(from, to) {
  if (!from) return 'Pick a start date'
  if (to && to < from) return 'The end date cannot be before the start date'
  return ''
}

export function buildPeriodParams({ mode, days, from, to }) {
  if (mode === 'custom') {
    if (validateCustomRange(from, to)) return null
    return to ? { from, to } : { from }
  }
  return { days }
}
