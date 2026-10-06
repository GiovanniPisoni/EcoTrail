import { Router } from 'express'
import mongoose from 'mongoose'
import Trail from '../models/Trail.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { ALERT_DEFAULTS, getAlertRules } from '../services/autoTrailAlert.js'

const router = Router()

const LIMITS = {
  riskCount: [1, 20],
  closeCount: [1, 50],
  windowHours: [1, 72],
  radiusMeters: [50, 2000]
}
const FIELDS = Object.keys(LIMITS)

function toResponse(trail) {
  const overrides = trail.alertRules ?? {}
  const proposal = trail.closureProposal

  return {
    ...Object.fromEntries(FIELDS.map((field) => [field, overrides[field] ?? null])),
    defaults: ALERT_DEFAULTS,
    effective: getAlertRules(trail),
    closureProposal: proposal
      ? {
          reason: proposal.reason,
          reportCount: proposal.reportCount,
          proposedAt: proposal.proposedAt
        }
      : null
  }
}

function isValid(field, value) {
  const [min, max] = LIMITS[field]
  return Number.isInteger(value) && value >= min && value <= max
}

async function findTrail(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: 'Invalid trail id' })
    return null
  }

  const trail = await Trail.findById(req.params.id)
  if (!trail) {
    res.status(404).json({ error: 'Trail not found' })
    return null
  }
  return trail
}

router.get('/:id/alert-rules', requireAuth, requireRole('admin'), async (req, res) => {
  const trail = await findTrail(req, res)
  if (trail) res.json(toResponse(trail))
})

router.patch('/:id/alert-rules', requireAuth, requireRole('admin'), async (req, res) => {
  const trail = await findTrail(req, res)
  if (!trail) return

  const provided = FIELDS.filter((field) => req.body?.[field] !== undefined)
  if (provided.length === 0) {
    return res.status(400).json({ error: `Provide at least one of: ${FIELDS.join(', ')}` })
  }

  for (const field of provided) {
    const value = req.body[field]
    if (value !== null && !isValid(field, value)) {
      const [min, max] = LIMITS[field]
      return res.status(400).json({
        error: `${field} must be an integer between ${min} and ${max}, or null to use the default`
      })
    }
  }

  for (const field of provided) {
    trail.set(`alertRules.${field}`, req.body[field] === null ? undefined : req.body[field])
  }

  const { riskCount, closeCount } = getAlertRules(trail)
  if (closeCount < riskCount) {
    return res.status(400).json({ error: 'closeCount must not be lower than riskCount' })
  }

  await trail.save()
  res.json(toResponse(trail))
})

router.delete('/:id/closure-proposal', requireAuth, requireRole('admin'), async (req, res) => {
  const trail = await findTrail(req, res)
  if (!trail) return

  if (!trail.closureProposal) {
    return res.status(404).json({ error: 'No closure proposal for this trail' })
  }

  trail.closureProposal = undefined
  trail.closureDismissedAt = new Date()
  await trail.save()

  res.json(toResponse(trail))
})

export default router
