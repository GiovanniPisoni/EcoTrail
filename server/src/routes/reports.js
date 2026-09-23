import { Router } from 'express'
import Report from '../models/Report.js'
import { requireAuth } from '../middleware/auth.js'
import { validateReportInput } from '../services/validateReportInput.js'
import { findNearestTrail, MAX_TRAIL_DISTANCE_METERS } from '../services/findNearestTrail.js'

const router = Router()

function reportToResponse(report, trail) {
  const [longitude, latitude] = report.location.coordinates

  return {
    id: report._id,
    type: report.type,
    severity: report.severity,
    description: report.description,
    latitude,
    longitude,
    trail: { id: trail._id, name: trail.name },
    validationStatus: report.validationStatus,
    createdAt: report.createdAt,
  }
}

router.post('/', requireAuth, async (req, res) => {
  const { value, errors } = validateReportInput(req.body)
  if (errors) {
    return res.status(400).json({ error: 'Invalid report data', details: errors })
  }

  const trail = await findNearestTrail(value.latitude, value.longitude)
  if (!trail) {
    return res
      .status(422)
      .json({ error: `No trail within ${MAX_TRAIL_DISTANCE_METERS} m of the given position` })
  }

  const report = await Report.create({
    author: req.user.id,
    type: value.type,
    severity: value.severity,
    description: value.description,
    location: { type: 'Point', coordinates: [value.longitude, value.latitude] },
    trail: trail._id,
  })

  res.status(201).json(reportToResponse(report, trail))
})

export default router
