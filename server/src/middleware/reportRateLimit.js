import { checkRateLimit, RATE_LIMIT_MAX_REPORTS } from '../services/reports/reportSpam.js'

// Runs before the upload middleware so that a refused request never reads the photo
export async function reportRateLimit(req, res, next) {
  try {
    const { limited, retryAfterSeconds } = await checkRateLimit(req.user.id)
    if (!limited) return next()

    res.set('Retry-After', String(retryAfterSeconds))
    return res.status(429).json({
      error: `Too many reports: the limit is ${RATE_LIMIT_MAX_REPORTS} in a few minutes. Try again later.`,
      retryAfterSeconds
    })
  } catch (err) {
    return next(err)
  }
}
