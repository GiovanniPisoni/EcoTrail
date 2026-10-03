import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { saveUserPosition, validatePosition } from '../services/userPresence.js'

const router = Router()

router.post('/', requireAuth, async (req, res) => {
  const validation = validatePosition(req.body)
  if (validation.errors) {
    return res.status(400).json({ error: 'Invalid position', details: validation.errors })
  }

  const presence = await saveUserPosition(req.user.id, validation.value)

  res.json({ updatedAt: presence.updatedAt })
})

export default router
