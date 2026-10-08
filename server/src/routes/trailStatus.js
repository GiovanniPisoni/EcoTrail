import { Router } from 'express'
import mongoose from 'mongoose'
import Trail, { TRAIL_STATUSES } from '../models/Trail.js'
import TrailStatusHistory from '../models/TrailStatusHistory.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { trailEvents, TRAIL_STATUS_CHANGED } from '../services/trails/trailEvents.js'

const router = Router()

const MAX_REASON_LENGTH = 500
const MAX_HISTORY_ENTRIES = 50

function historyEntryToResponse(entry) {
  return {
    id: entry._id,
    previousStatus: entry.previousStatus,
    newStatus: entry.newStatus,
    reason: entry.reason,
    alertedCount: entry.alertedCount,
    changedBy: entry.changedBy ? { id: entry.changedBy._id, email: entry.changedBy.email } : null,
    changedAt: entry.changedAt
  }
}

router.patch('/:id/status', requireAuth, requireRole('admin'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid trail id' })
  }

  const { status } = req.body
  if (!TRAIL_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${TRAIL_STATUSES.join(', ')}` })
  }

  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (!reason) {
    return res.status(400).json({ error: 'reason is required' })
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return res.status(400).json({ error: `reason must be at most ${MAX_REASON_LENGTH} characters` })
  }

  const trail = await Trail.findById(req.params.id)
  if (!trail) {
    return res.status(404).json({ error: 'Trail not found' })
  }

  if (trail.status === status) {
    return res.status(409).json({ error: `Trail is already ${status}` })
  }

  const previousStatus = trail.status
  trail.status = status
  trail.closureProposal = undefined
  await trail.save()

  const historyEntry = await TrailStatusHistory.create({
    trail: trail._id,
    previousStatus,
    newStatus: status,
    reason,
    changedBy: req.user.id
  })

  trailEvents.emit(TRAIL_STATUS_CHANGED, {
    trailId: trail._id,
    trailName: trail.name,
    previousStatus,
    newStatus: status,
    reason,
    changedBy: req.user.id,
    historyEntryId: historyEntry._id
  })

  res.json({
    id: trail._id,
    name: trail.name,
    status: trail.status,
    historyEntry: historyEntryToResponse(historyEntry)
  })
})

router.get('/:id/history', requireAuth, requireRole('admin'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid trail id' })
  }

  const entries = await TrailStatusHistory.find({ trail: req.params.id })
    .sort({ changedAt: -1 })
    .limit(MAX_HISTORY_ENTRIES)
    .populate('changedBy', 'email')

  res.json({ history: entries.map(historyEntryToResponse) })
})

export default router
