import { describe, it, expect, vi, beforeAll } from 'vitest'
import jwt from 'jsonwebtoken'
import { requireAuth, requireRole } from '../../src/middleware/auth.js'

const JWT_SECRET = 'test-secret'

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET
})

function mockRes() {
  const res = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('requireAuth', () => {
  it('returns 401 when there is no token', () => {
    const req = { headers: {} }
    const res = mockRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 for an invalid token', () => {
    const req = { headers: { authorization: 'Bearer not-a-real-token' } }
    const res = mockRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next and attaches the user for a valid token', () => {
    const token = jwt.sign({ id: '123', role: 'hiker' }, JWT_SECRET, { expiresIn: '7d' })
    const req = { headers: { authorization: `Bearer ${token}` } }
    const res = mockRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.user.role).toBe('hiker')
  })
})

describe('requireRole', () => {
  it('returns 403 when the role does not match', () => {
    const req = { user: { role: 'hiker' } }
    const res = mockRes()
    const next = vi.fn()

    requireRole('admin')(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next when the role matches', () => {
    const req = { user: { role: 'admin' } }
    const res = mockRes()
    const next = vi.fn()

    requireRole('admin')(req, res, next)

    expect(next).toHaveBeenCalled()
  })
})
