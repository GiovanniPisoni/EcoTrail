import { Router } from 'express'
import mongoose from 'mongoose'
import Trail from '../models/Trail.js'
import { parseBbox } from '../utils/bbox.js'

const router = Router()

export const MAX_TRAILS_PER_REQUEST = 500

const VALID_STATUSES = ['free', 'crowded', 'at_risk', 'closed']

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

  const query = { path: { $geoIntersects: { $geometry: polygon } } }

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` })
    }
    query.status = status
  }

  const trails = await Trail.find(query).limit(MAX_TRAILS_PER_REQUEST)
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
