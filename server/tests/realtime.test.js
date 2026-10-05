import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { createServer } from 'node:http'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { io as connectClient } from 'socket.io-client'
import app from '../src/index.js'
import User from '../src/models/User.js'
import Trail from '../src/models/Trail.js'
import Report from '../src/models/Report.js'
import { attachRealtime } from '../src/services/realtime.js'
import { trailEvents, TRAIL_STATUS_CHANGED } from '../src/services/trailEvents.js'
import { reportEvents, REPORT_CREATED, REPORT_UPDATED } from '../src/services/reportEvents.js'

const JWT_SECRET = 'test-secret'

let mongod
let httpServer
let realtime
let url
let sockets = []

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
}

async function createUser(role, email) {
  const user = await User.create({ email, password: 'hashed', role })
  return { user, token: tokenFor(user) }
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = connectClient(url, {
      auth: { token },
      reconnection: false,
      transports: ['websocket']
    })
    sockets.push(socket)
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', reject)
  })
}

function waitFor(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), 3000)
    socket.once(event, (payload) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

async function expectSilence(socket, event, durationMs = 400) {
  let received = false
  socket.once(event, () => {
    received = true
  })
  await new Promise((resolve) => setTimeout(resolve, durationMs))
  expect(received).toBe(false)
}

function createTrail(extra = {}) {
  return Trail.create({
    name: 'Trail',
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, 46.18],
        [10.91, 46.18]
      ]
    },
    ...extra
  })
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())

  httpServer = createServer(app)
  realtime = attachRealtime(httpServer)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  url = `http://localhost:${httpServer.address().port}`
})

afterAll(async () => {
  await realtime.close()
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Trail.deleteMany({}), Report.deleteMany({})])
})

afterEach(() => {
  sockets.forEach((socket) => socket.disconnect())
  sockets = []
})

describe('socket authentication', () => {
  it('rejects a connection without a token', async () => {
    await expect(connect(undefined)).rejects.toThrow('Unauthorized')
  })

  it('rejects a connection with an invalid token', async () => {
    await expect(connect('not-a-token')).rejects.toThrow('Unauthorized')
  })

  it('accepts a connection with a valid token', async () => {
    const { token } = await createUser('hiker', 'hiker@ecotrail.test')

    const socket = await connect(token)

    expect(socket.connected).toBe(true)
  })
})

describe('trail status updates', () => {
  it('sends a status change to every connected client without the admin reason', async () => {
    const { token: adminToken } = await createUser('admin', 'admin@ecotrail.test')
    const { token: hikerToken } = await createUser('hiker', 'hiker@ecotrail.test')
    const trail = await createTrail()
    const hiker = await connect(hikerToken)
    const admin = await connect(adminToken)
    const hikerEvent = waitFor(hiker, 'trail:status-changed')
    const adminEvent = waitFor(admin, 'trail:status-changed')

    const res = await request(app)
      .patch(`/api/trails/${trail._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'closed', reason: 'Internal note about a rockfall' })

    expect(res.status).toBe(200)
    const expected = { trailId: trail._id.toString(), previousStatus: 'free', status: 'closed' }
    expect(await hikerEvent).toEqual(expected)
    expect(await adminEvent).toEqual(expected)
  })

  it('also sends changes made by the system', async () => {
    const { token } = await createUser('hiker', 'hiker@ecotrail.test')
    const trail = await createTrail()
    const hiker = await connect(token)
    const received = waitFor(hiker, 'trail:status-changed')

    trailEvents.emit(TRAIL_STATUS_CHANGED, {
      trailId: trail._id,
      trailName: trail.name,
      previousStatus: 'free',
      newStatus: 'crowded',
      reason: 'Automatic',
      changedBy: null
    })

    expect(await received).toEqual({
      trailId: trail._id.toString(),
      previousStatus: 'free',
      status: 'crowded'
    })
  })
})

describe('report updates', () => {
  it('tells every client when a report is reviewed', async () => {
    const { token: adminToken } = await createUser('admin', 'admin@ecotrail.test')
    const { user: author, token: hikerToken } = await createUser('hiker', 'hiker@ecotrail.test')
    const trail = await createTrail()
    const report = await Report.create({
      author: author._id,
      trail: trail._id,
      type: 'fallen_tree',
      severity: 'medium',
      location: { type: 'Point', coordinates: [10.905, 46.18] }
    })
    const hiker = await connect(hikerToken)
    const admin = await connect(adminToken)
    const hikerEvent = waitFor(hiker, 'report:updated')
    const adminEvent = waitFor(admin, 'report:updated')

    const res = await request(app)
      .patch(`/api/reports/${report._id}/validate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'validated' })

    expect(res.status).toBe(200)
    const expected = {
      reportId: report._id.toString(),
      trailId: trail._id.toString(),
      validationStatus: 'validated'
    }
    expect(await hikerEvent).toEqual(expected)
    expect(await adminEvent).toEqual(expected)
  })

  it('tells every client when an author withdraws a pending report', async () => {
    const { token: adminToken } = await createUser('admin', 'admin@ecotrail.test')
    const { user: author, token: authorToken } = await createUser('hiker', 'hiker@ecotrail.test')
    const trail = await createTrail()
    const report = await Report.create({
      author: author._id,
      trail: trail._id,
      type: 'fallen_tree',
      severity: 'medium',
      location: { type: 'Point', coordinates: [10.905, 46.18] }
    })
    const admin = await connect(adminToken)
    const adminEvent = waitFor(admin, 'report:updated')

    const res = await request(app)
      .patch(`/api/reports/${report._id}/withdraw`)
      .set('Authorization', `Bearer ${authorToken}`)

    expect(res.status).toBe(200)
    expect(await adminEvent).toEqual({
      reportId: report._id.toString(),
      trailId: trail._id.toString(),
      validationStatus: 'withdrawn'
    })
  })

  it('tells only admins when a report is created', async () => {
    const { token: adminToken } = await createUser('admin', 'admin@ecotrail.test')
    const { token: hikerToken } = await createUser('hiker', 'hiker@ecotrail.test')
    const trail = await createTrail()
    const admin = await connect(adminToken)
    const hiker = await connect(hikerToken)
    const adminEvent = waitFor(admin, 'report:created')
    const hikerSilence = expectSilence(hiker, 'report:created')

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${hikerToken}`)
      .send({ type: 'fallen_tree', severity: 'high', latitude: 46.1805, longitude: 10.905 })

    expect(res.status).toBe(201)
    expect(await adminEvent).toEqual({
      reportId: res.body.id,
      trailId: trail._id.toString(),
      type: 'fallen_tree',
      severity: 'high'
    })
    await hikerSilence
  })

  it('does not send an event when the report is invalid', async () => {
    const { token: adminToken } = await createUser('admin', 'admin@ecotrail.test')
    const { token: hikerToken } = await createUser('hiker', 'hiker@ecotrail.test')
    await createTrail()
    const admin = await connect(adminToken)
    const silence = expectSilence(admin, 'report:created')

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${hikerToken}`)
      .send({ type: 'not-a-type' })

    expect(res.status).toBe(400)
    await silence
  })
})

describe('attachRealtime', () => {
  it('stops listening to the application events when closed', async () => {
    const before = {
      trail: trailEvents.listenerCount(TRAIL_STATUS_CHANGED),
      created: reportEvents.listenerCount(REPORT_CREATED),
      reviewed: reportEvents.listenerCount(REPORT_UPDATED)
    }
    const extraServer = createServer()
    const extra = attachRealtime(extraServer)

    expect(trailEvents.listenerCount(TRAIL_STATUS_CHANGED)).toBe(before.trail + 1)

    await extra.close()

    expect(trailEvents.listenerCount(TRAIL_STATUS_CHANGED)).toBe(before.trail)
    expect(reportEvents.listenerCount(REPORT_CREATED)).toBe(before.created)
    expect(reportEvents.listenerCount(REPORT_UPDATED)).toBe(before.reviewed)
  })
})
