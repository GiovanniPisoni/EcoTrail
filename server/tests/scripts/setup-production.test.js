import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import { MongoMemoryServer } from 'mongodb-memory-server'
import User from '../../src/models/User.js'
import Trail from '../../src/models/Trail.js'
import {
  MIN_ADMIN_PASSWORD_LENGTH,
  ensureAdmin,
  ensureTrails,
  loadTrails
} from '../../scripts/setup-production.js'

let mongod

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Trail.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Trail.deleteMany({})])
})

describe('ensureTrails', { timeout: 20000 }, () => {
  it('creates every trail of the data file', async () => {
    const trails = loadTrails()

    const result = await ensureTrails()

    expect(result).toEqual({ created: trails.length, existing: 0 })
    expect(await Trail.countDocuments()).toBe(trails.length)
  })

  it('does not touch the trails that are already there', async () => {
    await ensureTrails()
    const trail = await Trail.findOne()
    await Trail.updateOne({ _id: trail._id }, { status: 'closed' })

    const result = await ensureTrails()

    expect(result.created).toBe(0)
    expect(await Trail.countDocuments()).toBe(loadTrails().length)
    expect((await Trail.findById(trail._id)).status).toBe('closed')
  })

  it('adds only the trails that are missing', async () => {
    await ensureTrails()
    await Trail.deleteOne({ name: loadTrails()[0].name })

    const result = await ensureTrails()

    expect(result.created).toBe(1)
  })
})

describe('ensureAdmin', () => {
  const credentials = { email: 'Boss@Example.com', password: 'a-long-password' }

  it('creates an admin with a hashed password', async () => {
    expect(await ensureAdmin(credentials)).toBe('created')

    const admin = await User.findOne({ email: 'boss@example.com' })
    expect(admin.role).toBe('admin')
    expect(admin.password).not.toBe(credentials.password)
    expect(await bcrypt.compare(credentials.password, admin.password)).toBe(true)
  })

  it('leaves an existing admin untouched, password included', async () => {
    await ensureAdmin(credentials)
    const before = await User.findOne({ email: 'boss@example.com' })

    expect(await ensureAdmin({ ...credentials, password: 'another-password' })).toBe(
      'already-admin'
    )

    const after = await User.findOne({ email: 'boss@example.com' })
    expect(after.password).toBe(before.password)
    expect(await User.countDocuments()).toBe(1)
  })

  it('makes an existing hiker an admin without changing the password', async () => {
    const hiker = await User.create({
      email: 'boss@example.com',
      password: await bcrypt.hash('hikers-own-password', 10)
    })

    expect(await ensureAdmin(credentials)).toBe('promoted')

    const updated = await User.findById(hiker._id)
    expect(updated.role).toBe('admin')
    expect(updated.password).toBe(hiker.password)
  })

  it('refuses a password that is too short', async () => {
    await expect(
      ensureAdmin({ email: credentials.email, password: 'x'.repeat(MIN_ADMIN_PASSWORD_LENGTH - 1) })
    ).rejects.toThrow('ADMIN_PASSWORD')

    expect(await User.countDocuments()).toBe(0)
  })

  it('refuses a missing email or password', async () => {
    await expect(ensureAdmin({ password: credentials.password })).rejects.toThrow('ADMIN_EMAIL')
    await expect(ensureAdmin({ email: credentials.email })).rejects.toThrow('ADMIN_PASSWORD')
  })
})
