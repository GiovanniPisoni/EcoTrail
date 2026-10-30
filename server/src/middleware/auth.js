import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid token' })
  }

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Missing or invalid token' })
  }

  try {
    if (!(await User.exists({ _id: payload.id }))) {
      return res.status(401).json({ error: 'This account no longer exists' })
    }
  } catch (err) {
    return next(err)
  }

  req.user = payload
  next()
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}
