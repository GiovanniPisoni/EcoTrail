import { Router } from 'express'
import Report, { REPORT_TYPES } from '../models/Report.js'
import { requireAuth } from '../middleware/auth.js'
import { uploadReportPhoto } from '../middleware/uploadReportPhoto.js'
import { validateReportInput } from '../services/validateReportInput.js'
import { findNearestTrail, MAX_TRAIL_DISTANCE_METERS } from '../services/findNearestTrail.js'
import {
  InvalidPhotoError,
  deleteReportPhoto,
  processReportPhoto,
  storeReportPhoto
} from '../services/reportPhoto.js'
import { parseBbox } from '../utils/bbox.js'

const router = Router()

function reportToFeature(report) {
  return {
    type: 'Feature',
    geometry: report.location,
    properties: {
      id: report._id,
      type: report.type,
      severity: report.severity,
      description: report.description,
      photoUrl: report.photoUrl,
      trail: { id: report.trail._id, name: report.trail.name },
      validationStatus: report.validationStatus,
      createdAt: report.createdAt
    }
  }
}

router.get('/', async (req, res) => {
  const { bbox, type, since } = req.query

  const { polygon, error } = parseBbox(bbox)
  if (error) {
    return res.status(400).json({ error })
  }

  const query = {
    validationStatus: 'validated',
    location: { $geoWithin: { $geometry: polygon } }
  }

  if (type) {
    if (!REPORT_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${REPORT_TYPES.join(', ')}` })
    }
    query.type = type
  }

  if (since) {
    const sinceDate = new Date(since)
    if (Number.isNaN(sinceDate.getTime())) {
      return res.status(400).json({ error: 'since must be a valid ISO date' })
    }
    query.createdAt = { $gte: sinceDate }
  }

  const reports = await Report.find(query).populate('trail', 'name')

  res.json({
    type: 'FeatureCollection',
    features: reports.map(reportToFeature)
  })
})

function reportToResponse(report, trail) {
  const [longitude, latitude] = report.location.coordinates

  return {
    id: report._id,
    type: report.type,
    severity: report.severity,
    description: report.description,
    photoUrl: report.photoUrl,
    latitude,
    longitude,
    trail: { id: trail._id, name: trail.name },
    validationStatus: report.validationStatus,
    createdAt: report.createdAt
  }
}

router.post('/', requireAuth, uploadReportPhoto, async (req, res) => {
  const validation = validateReportInput(req.body)
  const errors = { ...validation.errors }

  let jpeg
  if (req.file) {
    try {
      jpeg = await processReportPhoto(req.file.buffer)
    } catch (err) {
      if (!(err instanceof InvalidPhotoError)) throw err
      errors.photo = err.message
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Invalid report data', details: errors })
  }

  const { value } = validation

  const trail = await findNearestTrail(value.latitude, value.longitude)
  if (!trail) {
    return res
      .status(422)
      .json({ error: `No trail within ${MAX_TRAIL_DISTANCE_METERS} m of the given position` })
  }

  const photoUrl = jpeg ? await storeReportPhoto(jpeg) : undefined

  let report
  try {
    report = await Report.create({
      author: req.user.id,
      type: value.type,
      severity: value.severity,
      description: value.description,
      photoUrl,
      location: { type: 'Point', coordinates: [value.longitude, value.latitude] },
      trail: trail._id
    })
  } catch (err) {
    await deleteReportPhoto(photoUrl)
    throw err
  }

  res.status(201).json(reportToResponse(report, trail))
})

export default router
