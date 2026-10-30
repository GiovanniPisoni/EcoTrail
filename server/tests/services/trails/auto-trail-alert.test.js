import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import Report from '../../../src/models/Report.js'
import Trail from '../../../src/models/Trail.js'
import TrailStatusHistory from '../../../src/models/TrailStatusHistory.js'
import User from '../../../src/models/User.js'
import { trailEvents, TRAIL_STATUS_CHANGED } from '../../../src/services/trails/trailEvents.js'
import { refreshTrustAround } from '../../../src/services/reports/reportTrust.js'
import {
  ALERT_DEFAULTS,
  HAZARD_TYPES,
  MIN_RELIABLE_TRUST,
  evaluateTrailAlert,
  getAlertRules
} from '../../../src/services/trails/autoTrailAlert.js'

let mongod
let trail
let listener

const LONGITUDE = 10.9
const LATITUDE = 46.18
const METERS_PER_DEGREE = 111320
const HOUR_MS = 60 * 60 * 1000

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Report.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([
    Report.deleteMany({}),
    Trail.deleteMany({}),
    TrailStatusHistory.deleteMany({}),
    User.deleteMany({})
  ])
  trail = await Trail.create({
    name: 'Test trail',
    path: {
      type: 'LineString',
      coordinates: [
        [LONGITUDE, LATITUDE],
        [LONGITUDE + 0.01, LATITUDE]
      ]
    }
  })
  listener = vi.fn()
  trailEvents.on(TRAIL_STATUS_CHANGED, listener)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  trailEvents.off(TRAIL_STATUS_CHANGED, listener)
  vi.restoreAllMocks()
})

let userCounter = 0
async function createUser() {
  userCounter += 1
  return User.create({ email: `hiker${userCounter}@ecotrail.test`, password: 'hashed' })
}

async function createReport({ metersNorth = 0, hoursAgo = 0, ...overrides } = {}) {
  const author = overrides.author ?? (await createUser())._id
  return Report.create({
    author,
    type: 'fallen_tree',
    severity: 'medium',
    trail: trail._id,
    trustScore: MIN_RELIABLE_TRUST,
    location: {
      type: 'Point',
      coordinates: [LONGITUDE, LATITUDE + metersNorth / METERS_PER_DEGREE]
    },
    createdAt: new Date(Date.now() - hoursAgo * HOUR_MS),
    ...overrides
  })
}

async function reliableReports(count, overrides) {
  const reports = []
  for (let i = 0; i < count; i++) reports.push(await createReport(overrides))
  return reports
}

async function status() {
  return (await Trail.findById(trail._id)).status
}

async function proposal() {
  return (await Trail.findById(trail._id)).closureProposal
}

describe('rules', () => {
  it('uses the agreed defaults', () => {
    expect(ALERT_DEFAULTS).toEqual({
      riskCount: 3,
      closeCount: 5,
      windowHours: 6,
      radiusMeters: 500
    })
    expect(MIN_RELIABLE_TRUST).toBe(2)
  })

  it('does not treat crowding reports as hazards', () => {
    expect(HAZARD_TYPES).not.toContain('overcrowding')
    expect(HAZARD_TYPES).toContain('fallen_tree')
  })

  it("takes a trail's own values over the defaults, one by one", () => {
    const rules = getAlertRules({ alertRules: { riskCount: 2, radiusMeters: 800 } })

    expect(rules).toEqual({ riskCount: 2, closeCount: 5, windowHours: 6, radiusMeters: 800 })
  })

  it('falls back to the defaults for a trail with no rules', () => {
    expect(getAlertRules({})).toEqual(ALERT_DEFAULTS)
  })
})

describe('marking a trail at risk', () => {
  it('does it by itself once enough reliable reports gather on it', async () => {
    const reports = await reliableReports(3)

    const outcome = await evaluateTrailAlert(reports[2])

    expect(outcome.markedAtRisk).toBe(true)
    expect(await status()).toBe('at_risk')
  })

  it('records who and why in the status history, with no author', async () => {
    const reports = await reliableReports(3)

    await evaluateTrailAlert(reports[0])

    const entry = await TrailStatusHistory.findOne({ trail: trail._id })
    expect(entry.previousStatus).toBe('free')
    expect(entry.newStatus).toBe('at_risk')
    expect(entry.changedBy).toBeNull()
    expect(entry.reason).toContain('Automatic')
    expect(entry.reason).toContain('3 reliable reports')
  })

  it('emits the status change event so notifications and live updates follow', async () => {
    const reports = await reliableReports(3)

    await evaluateTrailAlert(reports[0])

    expect(listener).toHaveBeenCalledTimes(1)
    const payload = listener.mock.calls[0][0]
    expect(payload).toMatchObject({
      newStatus: 'at_risk',
      previousStatus: 'free',
      changedBy: null,
      trailName: 'Test trail'
    })
    expect(payload.historyEntryId).toBeDefined()
  })

  it('also works from a crowded trail', async () => {
    await Trail.findByIdAndUpdate(trail._id, { status: 'crowded' })
    const reports = await reliableReports(3)

    await evaluateTrailAlert(reports[0])

    expect(await status()).toBe('at_risk')
  })

  it('does nothing with fewer reports than needed', async () => {
    const reports = await reliableReports(2)

    const outcome = await evaluateTrailAlert(reports[0])

    expect(outcome.markedAtRisk).toBe(false)
    expect(await status()).toBe('free')
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not change a trail that is already at risk', async () => {
    await Trail.findByIdAndUpdate(trail._id, { status: 'at_risk' })
    const reports = await reliableReports(3)

    await evaluateTrailAlert(reports[0])

    expect(listener).not.toHaveBeenCalled()
    expect(await TrailStatusHistory.countDocuments()).toBe(0)
  })

  it('leaves a closed trail alone', async () => {
    await Trail.findByIdAndUpdate(trail._id, { status: 'closed' })
    const reports = await reliableReports(6, { severity: 'high' })

    const outcome = await evaluateTrailAlert(reports[0])

    expect(outcome).toEqual({ markedAtRisk: false, proposedClosure: false })
    expect(await proposal()).toBeUndefined()
  })

  it('triggers only once even if evaluated again', async () => {
    const reports = await reliableReports(3)

    await evaluateTrailAlert(reports[0])
    await evaluateTrailAlert(reports[1])

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('uses the rules of that trail when the admin changed them', async () => {
    await Trail.findByIdAndUpdate(trail._id, { alertRules: { riskCount: 2 } })
    const reports = await reliableReports(2)

    await evaluateTrailAlert(reports[0])

    expect(await status()).toBe('at_risk')
  })
})

describe('which reports count', () => {
  it('ignores reports that nobody has confirmed', async () => {
    const reports = await reliableReports(3, { trustScore: MIN_RELIABLE_TRUST - 1 })

    await evaluateTrailAlert(reports[0])

    expect(await status()).toBe('free')
  })

  it.each([
    ['rejected', { validationStatus: 'rejected' }],
    ['withdrawn', { validationStatus: 'withdrawn' }],
    ['suspicious', { isSuspicious: true }],
    ['about crowding', { type: 'overcrowding' }],
    ['older than the time window', { hoursAgo: ALERT_DEFAULTS.windowHours + 1 }],
    ['too far from the others', { metersNorth: ALERT_DEFAULTS.radiusMeters + 200 }]
  ])('ignores a report that is %s', async (_label, overrides) => {
    const reports = await reliableReports(2)
    await createReport(overrides)

    await evaluateTrailAlert(reports[0])

    expect(await status()).toBe('free')
  })

  it('counts both pending and validated reports', async () => {
    const reports = await reliableReports(2, { validationStatus: 'pending' })
    await createReport({ validationStatus: 'validated' })

    await evaluateTrailAlert(reports[0])

    expect(await status()).toBe('at_risk')
  })

  it('ignores reliable reports that belong to another trail', async () => {
    const other = await Trail.create({
      name: 'Other trail',
      path: {
        type: 'LineString',
        coordinates: [
          [LONGITUDE, LATITUDE],
          [LONGITUDE + 0.01, LATITUDE]
        ]
      }
    })
    const reports = await reliableReports(2)
    await createReport({ trail: other._id })

    await evaluateTrailAlert(reports[0])

    expect(await status()).toBe('free')
  })
})

describe('proposing a closure', () => {
  it('proposes it, without closing, when enough reliable high-severity reports gather', async () => {
    const reports = await reliableReports(5, { severity: 'high' })

    const outcome = await evaluateTrailAlert(reports[0])

    expect(outcome.proposedClosure).toBe(true)
    expect(await status()).toBe('at_risk')
    const saved = await proposal()
    expect(saved.reportCount).toBe(5)
    expect(saved.reason).toContain('5 reliable high-severity reports')
    expect(saved.proposedAt).toBeInstanceOf(Date)
  })

  it('does not propose it when the reports are not severe enough', async () => {
    const reports = await reliableReports(5, { severity: 'medium' })

    const outcome = await evaluateTrailAlert(reports[0])

    expect(outcome.proposedClosure).toBe(false)
    expect(await proposal()).toBeUndefined()
  })

  it('does not propose it with fewer high-severity reports than needed', async () => {
    await reliableReports(4, { severity: 'high' })
    const last = await createReport({ severity: 'medium' })

    await evaluateTrailAlert(last)

    expect(await proposal()).toBeUndefined()
  })

  it('does not propose it again while one is waiting', async () => {
    const reports = await reliableReports(5, { severity: 'high' })

    await evaluateTrailAlert(reports[0])
    const second = await evaluateTrailAlert(reports[1])

    expect(second.proposedClosure).toBe(false)
  })
})

describe('after the admin steps in', () => {
  it('forgets the reports that came before a manual status change', async () => {
    const admin = await createUser()
    const reports = await reliableReports(3, { hoursAgo: 2 })
    await TrailStatusHistory.create({
      trail: trail._id,
      previousStatus: 'at_risk',
      newStatus: 'free',
      reason: 'Cleared by the rangers',
      changedBy: admin._id,
      changedAt: new Date(Date.now() - HOUR_MS)
    })

    await evaluateTrailAlert(reports[0])

    expect(await status()).toBe('free')
  })

  it('counts the reports that arrive after a manual status change', async () => {
    const admin = await createUser()
    await TrailStatusHistory.create({
      trail: trail._id,
      previousStatus: 'at_risk',
      newStatus: 'free',
      reason: 'Cleared by the rangers',
      changedBy: admin._id,
      changedAt: new Date(Date.now() - HOUR_MS)
    })
    const reports = await reliableReports(3)

    await evaluateTrailAlert(reports[0])

    expect(await status()).toBe('at_risk')
  })

  it('does not count automatic changes as the admin stepping in', async () => {
    await TrailStatusHistory.create({
      trail: trail._id,
      previousStatus: 'free',
      newStatus: 'crowded',
      reason: 'Automatic: crowded',
      changedBy: null,
      changedAt: new Date(Date.now() - HOUR_MS)
    })
    const reports = await reliableReports(3, { hoursAgo: 2 })

    await evaluateTrailAlert(reports[0])

    expect(await status()).toBe('at_risk')
  })

  it('forgets the reports that came before a dismissed closure proposal', async () => {
    await Trail.findByIdAndUpdate(trail._id, { closureDismissedAt: new Date() })
    const reports = await reliableReports(5, { severity: 'high', hoursAgo: 1 })

    const outcome = await evaluateTrailAlert(reports[0])

    expect(outcome.proposedClosure).toBe(false)
  })
})

describe('with the trust score calculated for real', () => {
  it('turns three reports from different users at one spot into an at risk trail', async () => {
    let last
    for (let i = 0; i < 3; i++) {
      last = await createReport({ trustScore: 0 })
      await refreshTrustAround(last)
    }

    const outcome = await evaluateTrailAlert(last)

    expect(outcome.markedAtRisk).toBe(true)
    expect(await status()).toBe('at_risk')
  })

  it('does not do it for three reports from one user', async () => {
    const author = await createUser()
    let last
    for (let i = 0; i < 3; i++) {
      last = await createReport({ author: author._id, trustScore: 0 })
      await refreshTrustAround(last)
    }

    const outcome = await evaluateTrailAlert(last)

    expect(outcome.markedAtRisk).toBe(false)
    expect(await status()).toBe('free')
  })
})
