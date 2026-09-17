import { Router } from 'express'

const router = Router()

router.get('/public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY })
})

export default router
