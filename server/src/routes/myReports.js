import { Router } from 'express'
import mongoose from 'mongoose'
import Report from '../models/Report.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

function reportToMineResponse(report) {
  return {
    id: report._id,
    type: report.type,
    severity: report.severity,
    description: report.description,
    photoUrl: report.photoUrl,
    trail: report.trail ? { id: report.trail._id, name: report.trail.name } : null,
    validationStatus: report.validationStatus,
    validationNote: report.validationNote,
    createdAt: report.createdAt,
    validatedAt: report.validatedAt
  }
}

router.get('/me', requireAuth, async (req, res) => {
  const reports = await Report.find({ author: req.user.id })
    .sort({ createdAt: -1 })
    .populate('trail', 'name')

  res.json({ reports: reports.map(reportToMineResponse) })
})

router.patch('/:id/withdraw', requireAuth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid report id' })
  }

  const report = await Report.findById(req.params.id).populate('trail', 'name')
  if (!report) {
    return res.status(404).json({ error: 'Report not found' })
  }

  if (String(report.author) !== req.user.id) {
    return res.status(403).json({ error: 'You can only withdraw your own reports' })
  }

  if (report.validationStatus !== 'pending') {
    return res
      .status(409)
      .json({ error: `Cannot withdraw a report that is already ${report.validationStatus}` })
  }

  report.validationStatus = 'withdrawn'
  await report.save()

  res.json(reportToMineResponse(report))
})

export default router
