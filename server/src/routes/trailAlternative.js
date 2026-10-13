import { Router } from 'express'
import mongoose from 'mongoose'
import Trail from '../models/Trail.js'
import { getAlternative, SUGGESTION_STATUSES } from '../services/trails/aiAlternatives.js'

const router = Router()

router.get('/:id/alternative', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid trail id' })
  }

  const trail = await Trail.findById(req.params.id).lean()
  if (!trail) {
    return res.status(404).json({ error: 'Trail not found' })
  }

  if (!SUGGESTION_STATUSES.includes(trail.status)) {
    return res.json({ alternative: null, reason: null, source: null })
  }

  res.json(await getAlternative(trail))
})

export default router
