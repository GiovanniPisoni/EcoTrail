import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import Report from '../src/models/Report.js'
import User from '../src/models/User.js'
import {
  BASE_TRUST_SCORE,
  CONFIRMATION_RADIUS_METERS,
  CONFIRMATION_WINDOW_MS,
  REPUTABLE_MIN_REPUTATION,
  adjustReputation,
  computeTrustScore,
  refreshTrustAround
} from '../src/services/reportTrust.js'

let mongod
let trailId

const LONGITUDE = 10.9
const LATITUDE = 46.18
const METERS_PER_DEGREE = 111320
const MINUTE_MS = 60 * 1000

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
  await Promise.all([Report.deleteMany({}), User.deleteMany({})])
  trailId = new mongoose.Types.ObjectId()
})

let userCounter = 0
function createUser(reputation = 0) {
  userCounter += 1
  return User.create({ email: `hiker${userCounter}@ecotrail.test`, password: 'hashed', reputation })
}

function createReport(author, { metersNorth = 0, minutesAgo = 0, ...overrides } = {}) {
  return Report.create({
    author: author._id,
    type: 'fallen_tree',
    severity: 'high',
    trail: trailId,
    location: {
      type: 'Point',
      coordinates: [LONGITUDE, LATITUDE + metersNorth / METERS_PER_DEGREE]
    },
    createdAt: new Date(Date.now() - minutesAgo * MINUTE_MS),
    ...overrides
  })
}

async function scoreOf(report) {
  return (await Report.findById(report._id)).trustScore
}

describe('rules', () => {
  it('uses the rules suggested for the project', () => {
    expect(BASE_TRUST_SCORE).toBe(1)
    expect(CONFIRMATION_RADIUS_METERS).toBe(300)
    expect(CONFIRMATION_WINDOW_MS).toBe(2 * 60 * MINUTE_MS)
    expect(REPUTABLE_MIN_REPUTATION).toBe(3)
  })
})

describe('trust score of reports from different users', () => {
  it('starts low for a report nobody has confirmed', async () => {
    const report = await createReport(await createUser())

    expect(await refreshTrustAround(report)).toBe(1)
    expect(await scoreOf(report)).toBe(1)
  })

  it('grows when other users report the same problem at the same spot', async () => {
    const first = await createReport(await createUser())
    expect(await refreshTrustAround(first)).toBe(1)

    const second = await createReport(await createUser())
    expect(await refreshTrustAround(second)).toBe(2)

    const third = await createReport(await createUser())
    expect(await refreshTrustAround(third)).toBe(3)

    expect(await scoreOf(first)).toBe(3)
    expect(await scoreOf(second)).toBe(3)
    expect(await scoreOf(third)).toBe(3)
  })
})

describe('trust score of reports from the same user', () => {
  it('does not grow when one user reports the same problem three times', async () => {
    const author = await createUser()
    const reports = []
    for (let i = 0; i < 3; i++) {
      const report = await createReport(author)
      await refreshTrustAround(report)
      reports.push(report)
    }

    for (const report of reports) {
      expect(await scoreOf(report)).toBe(1)
    }
  })

  it("counts a user once, however many reports they sent, towards someone else's report", async () => {
    const repeater = await createUser()
    await createReport(repeater)
    await createReport(repeater)
    const other = await createReport(await createUser())

    expect(await refreshTrustAround(other)).toBe(2)
  })
})

describe('what counts as the same problem', () => {
  it('counts reports within the radius but not beyond it', async () => {
    const original = await createReport(await createUser())
    const near = await createReport(await createUser(), {
      metersNorth: CONFIRMATION_RADIUS_METERS - 100
    })
    const far = await createReport(await createUser(), {
      metersNorth: -(CONFIRMATION_RADIUS_METERS + 100)
    })

    await refreshTrustAround(original)

    expect(await scoreOf(original)).toBe(2)
    expect(await scoreOf(near)).toBe(2)
    expect(await computeTrustScore(far)).toBe(1)
  })

  it('counts reports within the time window but not outside it', async () => {
    const original = await createReport(await createUser())
    const recent = await createReport(await createUser(), { minutesAgo: 60 })
    const old = await createReport(await createUser(), { minutesAgo: 200 })

    await refreshTrustAround(original)

    expect(await scoreOf(original)).toBe(2)
    expect(await scoreOf(recent)).toBe(2)
    expect(await computeTrustScore(old)).toBe(1)
  })

  it('does not count a different kind of problem', async () => {
    const original = await createReport(await createUser())
    const other = await createReport(await createUser(), { type: 'landslide' })

    expect(await refreshTrustAround(original)).toBe(1)
    expect(await refreshTrustAround(other)).toBe(1)
  })
})

describe('reports that do not count as confirmations', () => {
  it.each([
    ['rejected', { validationStatus: 'rejected' }],
    ['withdrawn', { validationStatus: 'withdrawn' }],
    ['suspicious', { isSuspicious: true }]
  ])('ignores a %s report', async (_label, overrides) => {
    const original = await createReport(await createUser())
    await createReport(await createUser(), overrides)

    expect(await refreshTrustAround(original)).toBe(1)
  })

  it('counts both pending and validated reports', async () => {
    const original = await createReport(await createUser())
    await createReport(await createUser(), { validationStatus: 'validated' })
    await createReport(await createUser(), { validationStatus: 'pending' })

    expect(await refreshTrustAround(original)).toBe(3)
  })

  it('lowers the score of the others when a report is withdrawn', async () => {
    const first = await createReport(await createUser())
    const second = await createReport(await createUser())
    await refreshTrustAround(second)
    expect(await scoreOf(first)).toBe(2)

    await Report.updateOne({ _id: second._id }, { validationStatus: 'withdrawn' })
    await refreshTrustAround(await Report.findById(second._id))

    expect(await scoreOf(first)).toBe(1)
  })

  it('raises the score again when a rejected report is validated', async () => {
    const first = await createReport(await createUser())
    const second = await createReport(await createUser(), { validationStatus: 'rejected' })
    await refreshTrustAround(second)
    expect(await scoreOf(first)).toBe(1)

    await Report.updateOne({ _id: second._id }, { validationStatus: 'validated' })
    await refreshTrustAround(await Report.findById(second._id))

    expect(await scoreOf(first)).toBe(2)
  })
})

describe('reputation of the author', () => {
  it('gives a bonus to a report from an author with enough validated reports', async () => {
    const reputable = await createReport(await createUser(REPUTABLE_MIN_REPUTATION))
    const newcomer = await createReport(await createUser(REPUTABLE_MIN_REPUTATION - 1), {
      metersNorth: 1000
    })

    expect(await computeTrustScore(reputable)).toBe(2)
    expect(await computeTrustScore(newcomer)).toBe(1)
  })

  it('makes a confirmation from a reputable author worth more', async () => {
    const original = await createReport(await createUser())
    await createReport(await createUser(REPUTABLE_MIN_REPUTATION))

    expect(await refreshTrustAround(original)).toBe(3)
  })

  it('does not give the bonus to a confirmation from a less experienced author', async () => {
    const original = await createReport(await createUser())
    await createReport(await createUser(REPUTABLE_MIN_REPUTATION - 1))

    expect(await refreshTrustAround(original)).toBe(2)
  })
})

describe('adjustReputation', () => {
  it('adds to the reputation of a user', async () => {
    const user = await createUser(2)

    await adjustReputation(user._id, 1)

    expect((await User.findById(user._id)).reputation).toBe(3)
  })

  it('subtracts from the reputation without going below zero', async () => {
    const user = await createUser(1)

    await adjustReputation(user._id, -1)
    await adjustReputation(user._id, -1)

    expect((await User.findById(user._id)).reputation).toBe(0)
  })
})
