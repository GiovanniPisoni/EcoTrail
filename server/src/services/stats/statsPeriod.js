export const STATS_TIMEZONE = 'Europe/Rome'
export const DEFAULT_PERIOD_DAYS = 7
export const MAX_PERIOD_DAYS = 366

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: STATS_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})

function zoneOffsetMs(timestamp) {
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, Number(part.value)])
  )
  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  return wallClock - Math.floor(timestamp / 1000) * 1000
}

export function zonedTime(year, month, day, hour = 0) {
  const asUtc = Date.UTC(year, month - 1, day, hour)
  let result = asUtc - zoneOffsetMs(asUtc)
  result = asUtc - zoneOffsetMs(result)
  return new Date(result)
}

export function zonedMidnight(year, month, day) {
  return zonedTime(year, month, day)
}

function parseDay(value) {
  const match = DATE_PATTERN.exec(String(value ?? ''))
  if (!match) return null

  const [year, month, day] = match.slice(1).map(Number)
  const check = new Date(Date.UTC(year, month - 1, day))
  const valid =
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  return valid ? { year, month, day } : null
}

export function parsePeriod(query = {}, now = new Date()) {
  if (query.from !== undefined || query.to !== undefined) {
    const from = parseDay(query.from)
    const to = query.to === undefined ? from : parseDay(query.to)

    if (!from || !to) {
      return { error: 'from and to must be valid dates in YYYY-MM-DD format' }
    }

    const start = zonedMidnight(from.year, from.month, from.day)
    const end = zonedMidnight(to.year, to.month, to.day + 1)

    if (end <= start) {
      return { error: 'to must not be before from' }
    }
    if (end - start > MAX_PERIOD_DAYS * DAY_MS) {
      return { error: `the period cannot exceed ${MAX_PERIOD_DAYS} days` }
    }
    return { value: { start, end } }
  }

  const days = query.days === undefined ? DEFAULT_PERIOD_DAYS : Number(query.days)
  if (!Number.isInteger(days) || days < 1 || days > MAX_PERIOD_DAYS) {
    return { error: `days must be an integer between 1 and ${MAX_PERIOD_DAYS}` }
  }

  return { value: { start: new Date(now.getTime() - days * DAY_MS), end: now } }
}
