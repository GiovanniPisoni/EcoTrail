import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { saveUserPosition, validatePosition } from '../services/userPresence.js'
import { checkOvercrowdingNear } from '../services/overcrowding.js'
import { checkApproachAlerts } from '../services/checkApproachAlerts.js'

const router = Router()

router.post('/', requireAuth, async (req, res) => {
  const validation = validatePosition(req.body)
  if (validation.errors) {
    return res.status(400).json({ error: 'Invalid position', details: validation.errors })
  }

  const presence = await saveUserPosition(req.user.id, validation.value)

  checkOvercrowdingNear(validation.value.latitude, validation.value.longitude).catch((err) => {
    console.error('[overcrowding] check failed:', err.message)
  })

  checkApproachAlerts(req.user.id, validation.value).catch((err) => {
    console.error('[approach] check failed:', err.message)
  })

  res.json({ updatedAt: presence.updatedAt })
})

export default router
