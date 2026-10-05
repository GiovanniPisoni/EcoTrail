import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/index.js'
import User from '../src/models/User.js'
import Trail from '../src/models/Trail.js'
import Report from '../src/models/Report.js'

const JWT_SECRET = 'test-secret'

let mongod
let adminToken
let userCounter = 0

const reportBody = {
  type: 'fallen_tree',
  severity: 'high',
  latitude: 46.1805,
  longitude: 10.905
}

async function createUser(role = 'hiker') {
  userCounter += 1
  const user = await User.create({
    email: `user${userCounter}@ecotrail.test`,
    password: 'hashed',
    role
  })
  const token = jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' })
  return { user, token }
}

async function postReport(token, body = reportBody) {
  const res = await request(app)
    .post('/api/reports')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
  expect(res.status).toBe(201)
  return res.body.id
}

function validate(id, status) {
  return request(app)
    .patch(`/api/reports/${id}/validate`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status })
}

async function scoreOf(id) {
  return (await Report.findById(id)).trustScore
}

async function reputationOf(user) {
  return (await User.findById(user._id)).reputation
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Trail.init()
  await Report.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Trail.deleteMany({}), Report.deleteMany({})])
  await Trail.create({
    name: 'Test trail',
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, 46.18],
        [10.91, 46.18]
      ]
    }
  })
  ;({ token: adminToken } = await createUser('admin'))
})

describe('trust score when reports are sent', () => {
  it('rises when three different users report the same problem at the same spot', async () => {
    const ids = []
    for (let i = 0; i < 3; i++) {
      ids.push(await postReport((await createUser()).token))
    }

    expect(await Promise.all(ids.map(scoreOf))).toEqual([3, 3, 3])
  })

  it('does not rise when the same user reports the problem three times', async () => {
    const { token } = await createUser()
    const ids = []
    for (let i = 0; i < 3; i++) {
      ids.push(await postReport(token))
    }

    expect(await Promise.all(ids.map(scoreOf))).toEqual([1, 1, 1])
  })

  it('goes back down when someone withdraws their report', async () => {
    const first = await createUser()
    const second = await createUser()
    const firstId = await postReport(first.token)
    const secondId = await postReport(second.token)
    expect(await scoreOf(firstId)).toBe(2)

    await request(app)
      .patch(`/api/reports/${secondId}/withdraw`)
      .set('Authorization', `Bearer ${second.token}`)

    expect(await scoreOf(firstId)).toBe(1)
  })
})

describe('trust score in the admin API', () => {
  it('is included in the report list', async () => {
    await postReport((await createUser()).token)
    await postReport((await createUser()).token)

    const res = await request(app)
      .get('/api/reports/admin')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.reports.map((report) => report.trustScore)).toEqual([2, 2])
  })

  it('is updated in the response when a report is reviewed', async () => {
    const id = await postReport((await createUser()).token)
    await postReport((await createUser()).token)

    const res = await validate(id, 'validated')

    expect(res.status).toBe(200)
    expect(res.body.trustScore).toBe(2)
  })

  it('stops counting a rejected report as a confirmation', async () => {
    const firstId = await postReport((await createUser()).token)
    const secondId = await postReport((await createUser()).token)
    expect(await scoreOf(firstId)).toBe(2)

    await validate(secondId, 'rejected')

    expect(await scoreOf(firstId)).toBe(1)
  })
})

describe('reputation of the author', () => {
  it('goes up by one when an admin validates a report', async () => {
    const author = await createUser()
    const id = await postReport(author.token)

    await validate(id, 'validated')

    expect(await reputationOf(author.user)).toBe(1)
  })

  it('does not change when the same report is validated again', async () => {
    const author = await createUser()
    const id = await postReport(author.token)

    await validate(id, 'validated')
    await validate(id, 'validated')

    expect(await reputationOf(author.user)).toBe(1)
  })

  it('does not change when a report is rejected', async () => {
    const author = await createUser()
    const id = await postReport(author.token)

    await validate(id, 'rejected')

    expect(await reputationOf(author.user)).toBe(0)
  })

  it('goes back down when a validation is reversed', async () => {
    const author = await createUser()
    const id = await postReport(author.token)
    await validate(id, 'validated')

    await validate(id, 'rejected')

    expect(await reputationOf(author.user)).toBe(0)
  })

  it('makes the next reports of an author count more once they have three validated', async () => {
    const author = await createUser()
    for (let i = 0; i < 3; i++) {
      await validate(
        await postReport(author.token, { ...reportBody, type: 'landslide' }),
        'validated'
      )
    }
    expect(await reputationOf(author.user)).toBe(3)

    const id = await postReport(author.token)

    expect(await scoreOf(id)).toBe(2)
  })
})
