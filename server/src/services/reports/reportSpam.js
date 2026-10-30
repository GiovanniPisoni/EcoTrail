import Report from '../../models/Report.js'

export const RATE_LIMIT_MAX_REPORTS = 10
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
export const SUSPICIOUS_RADIUS_METERS = 50
export const SUSPICIOUS_WINDOW_MS = 60 * 1000
export const SPAM_REPUTATION_PENALTY = 2

const EARTH_RADIUS_METERS = 6378100

export async function checkRateLimit(userId, { now = new Date() } = {}) {
  const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS)
  const query = { author: userId, createdAt: { $gte: since } }

  const count = await Report.countDocuments(query)
  if (count < RATE_LIMIT_MAX_REPORTS) return { limited: false }

  const [blocking] = await Report.find(query)
    .sort({ createdAt: 1 })
    .skip(count - RATE_LIMIT_MAX_REPORTS)
    .limit(1)
    .select('createdAt')
    .lean()

  const freeAt = new Date(blocking.createdAt).getTime() + RATE_LIMIT_WINDOW_MS
  const retryAfterSeconds = Math.max(1, Math.ceil((freeAt - now.getTime()) / 1000))
  return { limited: true, retryAfterSeconds }
}

export async function isSuspiciousReport(
  { author, type, longitude, latitude, createdAt },
  { now = new Date() } = {}
) {
  const at = (createdAt ?? now).getTime()

  const previous = await Report.exists({
    author,
    type,
    createdAt: {
      $gte: new Date(at - SUSPICIOUS_WINDOW_MS),
      $lte: new Date(at + SUSPICIOUS_WINDOW_MS)
    },
    location: {
      $geoWithin: {
        $centerSphere: [[longitude, latitude], SUSPICIOUS_RADIUS_METERS / EARTH_RADIUS_METERS]
      }
    }
  })

  return Boolean(previous)
}
