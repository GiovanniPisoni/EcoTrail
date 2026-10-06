import { Router } from 'express'
import mongoose from 'mongoose'
import Report, { REPORT_TYPES, REPORT_SEVERITIES } from '../models/Report.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { uploadReportPhoto } from '../middleware/uploadReportPhoto.js'
import { validateReportInput } from '../services/validateReportInput.js'
import { findNearestTrail, MAX_TRAIL_DISTANCE_METERS } from '../services/findNearestTrail.js'
import {
  InvalidPhotoError,
  deleteReportPhoto,
  processReportPhoto,
  storeReportPhoto
} from '../services/reportPhoto.js'
import { reportEvents, REPORT_CREATED, REPORT_UPDATED } from '../services/reportEvents.js'
import { parseBbox } from '../utils/bbox.js'
import { adjustReputation, refreshTrustSafely } from '../services/reportTrust.js'

const router = Router()

const VALIDATION_STATUSES = ['pending', 'validated', 'rejected']
const REVIEW_STATUSES = ['validated', 'rejected']
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

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

function reportToAdminResponse(report) {
  const [longitude, latitude] = report.location.coordinates

  return {
    id: report._id,
    type: report.type,
    severity: report.severity,
    description: report.description,
    photoUrl: report.photoUrl,
    latitude,
    longitude,
    trail: report.trail ? { id: report.trail._id, name: report.trail.name } : null,
    author: report.author ? { id: report.author._id, email: report.author.email } : null,
    validationStatus: report.validationStatus,
    validationNote: report.validationNote,
    validatedBy: report.validatedBy,
    validatedAt: report.validatedAt,
    trustScore: report.trustScore,
    createdAt: report.createdAt
  }
}

router.get('/admin', requireAuth, requireRole('admin'), async (req, res) => {
  const {
    trail,
    severity,
    validationStatus,
    since,
    until,
    page = '1',
    limit = String(DEFAULT_PAGE_SIZE)
  } = req.query

  const query = {}

  if (trail) {
    if (!mongoose.Types.ObjectId.isValid(trail)) {
      return res.status(400).json({ error: 'trail must be a valid id' })
    }
    query.trail = trail
  }

  if (severity) {
    if (!REPORT_SEVERITIES.includes(severity)) {
      return res
        .status(400)
        .json({ error: `severity must be one of: ${REPORT_SEVERITIES.join(', ')}` })
    }
    query.severity = severity
  }

  if (validationStatus) {
    if (!VALIDATION_STATUSES.includes(validationStatus)) {
      return res
        .status(400)
        .json({ error: `validationStatus must be one of: ${VALIDATION_STATUSES.join(', ')}` })
    }
    query.validationStatus = validationStatus
  }

  if (since || until) {
    query.createdAt = {}
    if (since) {
      const sinceDate = new Date(since)
      if (Number.isNaN(sinceDate.getTime())) {
        return res.status(400).json({ error: 'since must be a valid ISO date' })
      }
      query.createdAt.$gte = sinceDate
    }
    if (until) {
      const untilDate = new Date(until)
      if (Number.isNaN(untilDate.getTime())) {
        return res.status(400).json({ error: 'until must be a valid ISO date' })
      }
      query.createdAt.$lte = untilDate
    }
  }

  const pageNumber = Number.parseInt(page, 10)
  const pageSize = Number.parseInt(limit, 10)
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return res.status(400).json({ error: 'page must be a positive integer' })
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    return res
      .status(400)
      .json({ error: `limit must be an integer between 1 and ${MAX_PAGE_SIZE}` })
  }

  const [reports, total] = await Promise.all([
    Report.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .populate('trail', 'name')
      .populate('author', 'email'),
    Report.countDocuments(query)
  ])

  res.json({
    reports: reports.map(reportToAdminResponse),
    pagination: {
      page: pageNumber,
      limit: pageSize,
      total,
      pages: Math.ceil(total / pageSize)
    }
  })
})

router.patch('/:id/validate', requireAuth, requireRole('admin'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid report id' })
  }

  const { status, note } = req.body

  if (!REVIEW_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${REVIEW_STATUSES.join(', ')}` })
  }

  const report = await Report.findById(req.params.id)
    .populate('trail', 'name')
    .populate('author', 'email')
  if (!report) {
    return res.status(404).json({ error: 'Report not found' })
  }

  const wasValidated = report.validationStatus === 'validated'

  report.validationStatus = status
  report.validationNote = note || undefined
  report.validatedBy = req.user.id
  report.validatedAt = new Date()
  await report.save()

  const reputationChange = Number(status === 'validated') - Number(wasValidated)
  if (reputationChange !== 0 && report.author) {
    await adjustReputation(report.author._id, reputationChange)
  }
  const trustScore = await refreshTrustSafely(report)
  if (trustScore !== null) report.trustScore = trustScore

  reportEvents.emit(REPORT_UPDATED, {
    reportId: report._id,
    trailId: report.trail?._id,
    validationStatus: report.validationStatus
  })

  res.json(reportToAdminResponse(report))
})

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

  await refreshTrustSafely(report)

  reportEvents.emit(REPORT_CREATED, {
    reportId: report._id,
    trailId: trail._id,
    type: report.type,
    severity: report.severity
  })

  res.status(201).json(reportToResponse(report, trail))
})

export default router
