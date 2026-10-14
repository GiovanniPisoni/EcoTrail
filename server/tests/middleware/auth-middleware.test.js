import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import User from '../../src/models/User.js'
import { requireAuth, requireRole } from '../../src/middleware/auth.js'

vi.mock('../../src/models/User.js', () => ({ default: { exists: vi.fn() } }))

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
  beforeEach(() => {
    User.exists.mockReset()
    User.exists.mockResolvedValue({ _id: '123' })
  })

  function requestWith(token) {
    return { headers: token ? { authorization: `Bearer ${token}` } : {} }
  }

  function signed(payload = { id: '123', role: 'hiker' }) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
  }

  it('returns 401 when there is no token', async () => {
    const res = mockRes()
    const next = vi.fn()

    await requireAuth(requestWith(), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 for an invalid token', async () => {
    const res = mockRes()
    const next = vi.fn()

    await requireAuth(requestWith('not-a-real-token'), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next and attaches the user for a valid token', async () => {
    const req = requestWith(signed())
    const next = vi.fn()

    await requireAuth(req, mockRes(), next)

    expect(User.exists).toHaveBeenCalledWith({ _id: '123' })
    expect(next).toHaveBeenCalledWith()
    expect(req.user.role).toBe('hiker')
  })

  it('returns 401 when the account of a valid token no longer exists', async () => {
    User.exists.mockResolvedValue(null)
    const res = mockRes()
    const next = vi.fn()

    await requireAuth(requestWith(signed()), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'This account no longer exists' })
    expect(next).not.toHaveBeenCalled()
  })

  it('does not look for the account when the token is not valid', async () => {
    await requireAuth(requestWith('not-a-real-token'), mockRes(), vi.fn())

    expect(User.exists).not.toHaveBeenCalled()
  })

  it('hands the error to Express when the database fails', async () => {
    const failure = new Error('database is down')
    User.exists.mockRejectedValue(failure)
    const next = vi.fn()

    await requireAuth(requestWith(signed()), mockRes(), next)

    expect(next).toHaveBeenCalledWith(failure)
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
