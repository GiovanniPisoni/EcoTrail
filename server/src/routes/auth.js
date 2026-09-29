import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const TOKEN_EXPIRY = '7d'

router.post('/register', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  const existing = await User.findOne({ email })
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' })
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  const user = await User.create({ email, password: hashedPassword, role: 'hiker' })

  res.status(201).json({ id: user._id, email: user.email, role: user.role })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const user = await User.findOne({ email })
  const passwordMatches = user && (await bcrypt.compare(password, user.password))

  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  })

  res.json({ token })
})

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id)
  if (!user) {
    return res.status(404).json({ error: 'User not found' })
  }

  res.json({ id: user._id, email: user.email, role: user.role, reputation: user.reputation })
})

export default router
