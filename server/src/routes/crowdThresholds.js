import { Router } from 'express'
import mongoose from 'mongoose'
import Trail from '../models/Trail.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  defaultCrowdThreshold,
  defaultReleaseThreshold,
  getCrowdThresholds
} from '../services/trails/overcrowding.js'

const router = Router()

const MAX_THRESHOLD = 1000
const FIELDS = ['crowdThreshold', 'crowdReleaseThreshold']

function toResponse(trail) {
  const defaultEnter = defaultCrowdThreshold(trail)
  return {
    crowdThreshold: trail.crowdThreshold ?? null,
    crowdReleaseThreshold: trail.crowdReleaseThreshold ?? null,
    defaults: { enter: defaultEnter, release: defaultReleaseThreshold(defaultEnter) },
    effective: getCrowdThresholds(trail)
  }
}

function isValidThreshold(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_THRESHOLD
}

router.get('/:id/crowd-thresholds', requireAuth, requireRole('admin'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid trail id' })
  }

  const trail = await Trail.findById(req.params.id)
  if (!trail) {
    return res.status(404).json({ error: 'Trail not found' })
  }

  res.json(toResponse(trail))
})

router.patch('/:id/crowd-thresholds', requireAuth, requireRole('admin'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid trail id' })
  }

  const provided = FIELDS.filter((field) => req.body?.[field] !== undefined)
  if (provided.length === 0) {
    return res.status(400).json({ error: `Provide at least one of: ${FIELDS.join(', ')}` })
  }

  for (const field of provided) {
    const value = req.body[field]
    if (value !== null && !isValidThreshold(value)) {
      return res.status(400).json({
        error: `${field} must be an integer between 1 and ${MAX_THRESHOLD}, or null to use the default`
      })
    }
  }

  const trail = await Trail.findById(req.params.id)
  if (!trail) {
    return res.status(404).json({ error: 'Trail not found' })
  }

  for (const field of provided) {
    trail.set(field, req.body[field] === null ? undefined : req.body[field])
  }

  const { enter, release } = getCrowdThresholds(trail)
  if (trail.crowdReleaseThreshold !== undefined && trail.crowdReleaseThreshold >= enter) {
    return res
      .status(400)
      .json({ error: 'crowdReleaseThreshold must be lower than the alert threshold' })
  }
  if (enter < 2 || release < 1) {
    return res.status(400).json({ error: 'crowdThreshold must be at least 2' })
  }

  await trail.save()
  res.json(toResponse(trail))
})

export default router
