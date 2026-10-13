import { Router } from 'express'
import mongoose from 'mongoose'
import Trail from '../models/Trail.js'
import TrailStatusHistory from '../models/TrailStatusHistory.js'
import { parseBbox } from '../utils/bbox.js'

const router = Router()

export const MAX_TRAILS_PER_REQUEST = 500

const VALID_STATUSES = ['free', 'crowded', 'at_risk', 'closed']

async function findStatusReasons(trails) {
  const notFree = trails.filter((trail) => trail.status !== 'free')
  if (notFree.length === 0) return new Map()

  const latest = await TrailStatusHistory.aggregate([
    { $match: { trail: { $in: notFree.map((trail) => trail._id) } } },
    { $sort: { changedAt: -1 } },
    {
      $group: {
        _id: '$trail',
        newStatus: { $first: '$newStatus' },
        reason: { $first: '$reason' },
        changedAt: { $first: '$changedAt' }
      }
    }
  ])

  const reasons = new Map()
  for (const entry of latest) {
    const trail = notFree.find((candidate) => String(candidate._id) === String(entry._id))
    if (trail?.status === entry.newStatus) {
      reasons.set(String(entry._id), { reason: entry.reason, changedAt: entry.changedAt })
    }
  }
  return reasons
}

function trailToFeature(trail, { includeFragileSegments = false, statusReason } = {}) {
  const properties = {
    id: trail._id,
    name: trail.name,
    status: trail.status,
    distanceKm: trail.distanceKm,
    durationMinutes: trail.durationMinutes,
    difficulty: trail.difficulty,
    photoUrl: trail.photoUrl
  }
  if (statusReason) {
    properties.statusReason = statusReason.reason
    properties.statusChangedAt = statusReason.changedAt
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

async function trailsToFeatureCollection(trails) {
  const reasons = await findStatusReasons(trails)

  return {
    type: 'FeatureCollection',
    features: trails.map((trail) =>
      trailToFeature(trail, { statusReason: reasons.get(String(trail._id)) })
    )
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
  res.json(await trailsToFeatureCollection(trails))
})

router.get('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid trail id' })
  }

  const trail = await Trail.findById(req.params.id)
  if (!trail) {
    return res.status(404).json({ error: 'Trail not found' })
  }

  const reasons = await findStatusReasons([trail])
  res.json(
    trailToFeature(trail, {
      includeFragileSegments: true,
      statusReason: reasons.get(String(trail._id))
    })
  )
})

export default router
