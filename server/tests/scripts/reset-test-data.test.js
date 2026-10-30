import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import User from '../../src/models/User.js'
import Trail from '../../src/models/Trail.js'
import Report from '../../src/models/Report.js'
import Notification from '../../src/models/Notification.js'
import TrailStatusHistory from '../../src/models/TrailStatusHistory.js'
import { resetTestData } from '../../scripts/reset-test-data.js'

let mongod
let admin
let tester
let trail
let other

const path = {
  type: 'LineString',
  coordinates: [
    [10.9, 46.18],
    [10.91, 46.18]
  ]
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all(
    [User, Trail, Report, Notification, TrailStatusHistory].map((model) => model.deleteMany({}))
  )

  admin = await User.create({ email: 'admin@x.org', password: 'h', role: 'admin' })
  tester = await User.create({ email: 'tester@x.org', password: 'h', reputation: 5 })
  await User.create({ email: 'visitor@x.org', password: 'h' })
  trail = await Trail.create({ name: 'Ceda', path, status: 'closed' })
  other = await Trail.create({ name: 'Lago', path, status: 'crowded' })
  await Report.create({
    author: tester._id,
    trail: trail._id,
    type: 'fallen_tree',
    severity: 'high',
    location: { type: 'Point', coordinates: [10.905, 46.18] }
  })
  await Notification.create({ user: tester._id, type: 'emergency', title: 't', body: 'b' })
  await TrailStatusHistory.create({
    trail: trail._id,
    previousStatus: 'free',
    newStatus: 'closed',
    reason: 'test',
    changedBy: admin._id
  })
})

describe('resetTestData', () => {
  it('only counts what it would do when apply is not set', async () => {
    const summary = await resetTestData({ keepEmails: ['tester@x.org'] })

    expect(summary.cleared.reports).toBe(1)
    expect(summary.usersDeleted).toBe(1)
    expect(summary.trailsReset).toBe(2)
    expect(await Report.countDocuments()).toBe(1)
    expect(await User.countDocuments()).toBe(3)
    expect((await Trail.findById(trail._id)).status).toBe('closed')
  })

  it('removes the test data and sets every trail back to free', async () => {
    await resetTestData({ keepEmails: ['tester@x.org'], apply: true })

    expect(await Report.countDocuments()).toBe(0)
    expect(await Notification.countDocuments()).toBe(0)
    expect(await TrailStatusHistory.countDocuments()).toBe(0)
    expect((await Trail.findById(trail._id)).status).toBe('free')
    expect((await Trail.findById(other._id)).status).toBe('free')
  })

  it('never deletes the trails or the admin, and keeps the listed accounts', async () => {
    await resetTestData({ keepEmails: ['Tester@X.org'], apply: true })

    expect(await Trail.countDocuments()).toBe(2)
    const emails = (await User.find()).map((user) => user.email).sort()
    expect(emails).toEqual(['admin@x.org', 'tester@x.org'])
  })

  it('resets the reputation of the accounts it keeps', async () => {
    await resetTestData({ keepEmails: ['tester@x.org'], apply: true })

    expect((await User.findById(tester._id)).reputation).toBe(0)
  })

  it('can leave one trail at risk with a reason in its history', async () => {
    await resetTestData({
      keepEmails: [],
      riskTrail: 'Ceda',
      reason: 'Fallen tree after the storm',
      apply: true
    })

    expect((await Trail.findById(trail._id)).status).toBe('at_risk')
    expect((await Trail.findById(other._id)).status).toBe('free')
    const history = await TrailStatusHistory.find()
    expect(history).toHaveLength(1)
    expect(history[0].reason).toBe('Fallen tree after the storm')
    expect(String(history[0].changedBy)).toBe(String(admin._id))
  })

  it('refuses an unknown trail and changes nothing', async () => {
    await expect(resetTestData({ riskTrail: 'Nowhere', reason: 'x', apply: true })).rejects.toThrow(
      'No trail called'
    )

    expect(await Report.countDocuments()).toBe(1)
    expect(await User.countDocuments()).toBe(3)
  })

  it('refuses to set a trail at risk without a reason', async () => {
    await expect(resetTestData({ riskTrail: 'Ceda', apply: true })).rejects.toThrow('reason')

    expect((await Trail.findById(trail._id)).status).toBe('closed')
  })
})
