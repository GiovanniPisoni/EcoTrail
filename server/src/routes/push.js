import { Router } from 'express'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'
import { sendPush } from '../services/sendPush.js'

const router = Router()

router.get('/public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY })
})

router.post('/subscribe', requireAuth, async (req, res) => {
  const { endpoint, keys } = req.body

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' })
  }

  const user = await User.findById(req.user.id)
  const alreadySubscribed = user.pushSubscriptions.some((sub) => sub.endpoint === endpoint)

  if (!alreadySubscribed) {
    user.pushSubscriptions.push({ endpoint, keys })
    await user.save()
  }

  res.status(201).json({ ok: true })
})

router.post('/test', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id)

  if (user.pushSubscriptions.length === 0) {
    return res.status(400).json({ error: 'No push subscription registered for this user' })
  }

  await sendPush(user, {
    title: 'EcoTrail',
    body: 'Notification test successful!'
  })

  res.json({ ok: true })
})

export default router
