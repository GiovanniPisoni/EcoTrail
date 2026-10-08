import { Router } from 'express'
import mongoose from 'mongoose'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { parsePeriod } from '../services/statsPeriod.js'
import { EVENT_KINDS, getAttendance, getEvents, getHeatmap } from '../services/stats.js'

const router = Router()

router.use(requireAuth, requireRole('admin'))

function withPeriod(handler) {
  return async (req, res) => {
    const period = parsePeriod(req.query)
    if (period.error) {
      return res.status(400).json({ error: period.error })
    }

    const body = await handler(req, period.value)
    if (body.error) {
      return res.status(400).json({ error: body.error })
    }

    res.json({ period: { from: period.value.start, to: period.value.end }, ...body })
  }
}

router.get(
  '/attendance',
  withPeriod(async (req, period) => {
    const { trail } = req.query
    if (trail !== undefined && !mongoose.isValidObjectId(trail)) {
      return { error: 'trail must be a valid id' }
    }
    return getAttendance(period, trail)
  })
)

router.get(
  '/heatmap',
  withPeriod(async (req, period) => ({ points: await getHeatmap(period) }))
)

router.get(
  '/events',
  withPeriod(async (req, period) => {
    const { type } = req.query
    if (type !== undefined && !EVENT_KINDS.includes(type)) {
      return { error: `type must be one of: ${EVENT_KINDS.join(', ')}` }
    }
    return getEvents(period, type)
  })
)

export default router
