import { Router } from 'express'
import mongoose from 'mongoose'
import Trail from '../models/Trail.js'

const router = Router()

const VALID_STATUSES = ['free', 'crowded', 'at_risk', 'closed']

function bboxToPolygon(west, south, east, north) {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south]
      ]
    ]
  }
}

function parseBbox(bboxParam) {
  if (!bboxParam) {
    return { error: 'bbox query parameter is required (format: west,south,east,north)' }
  }

  const parts = bboxParam.split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return { error: 'bbox must be 4 comma-separated numbers: west,south,east,north' }
  }

  const [west, south, east, north] = parts
  if (west >= east || south >= north) {
    return { error: 'invalid bbox: west must be less than east, south less than north' }
  }

  return { polygon: bboxToPolygon(west, south, east, north) }
}

function trailToFeature(trail, { includeFragileSegments = false } = {}) {
  const properties = {
    id: trail._id,
    name: trail.name,
    status: trail.status,
    distanceKm: trail.distanceKm,
    durationMinutes: trail.durationMinutes,
    difficulty: trail.difficulty,
    photoUrl: trail.photoUrl
  }
  if (includeFragileSegments) {
    properties.fragileSegments = trail.fragileSegments
  }

  return {
    type: 'Feature',
    geometry: trail.path,
    properties
  }
}

function trailsToFeatureCollection(trails) {
  return {
    type: 'FeatureCollection',
    features: trails.map((trail) => trailToFeature(trail))
  }
}

router.get('/', async (req, res) => {
  const { bbox, status } = req.query

  const { polygon, error } = parseBbox(bbox)
  if (error) {
    return res.status(400).json({ error })
  }

  const query = { path: { $geoWithin: { $geometry: polygon } } }

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` })
    }
    query.status = status
  }

  const trails = await Trail.find(query)
  res.json(trailsToFeatureCollection(trails))
})

router.get('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid trail id' })
  }

  const trail = await Trail.findById(req.params.id)
  if (!trail) {
    return res.status(404).json({ error: 'Trail not found' })
  }

  res.json(trailToFeature(trail, { includeFragileSegments: true }))
})

export default router
