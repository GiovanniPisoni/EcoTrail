import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../../src/index.js'
import Trail from '../../src/models/Trail.js'
import TrailStatusHistory from '../../src/models/TrailStatusHistory.js'

let mongod

const BBOX = '10,40,11,41'

const path = {
  type: 'LineString',
  coordinates: [
    [10.2, 40.2],
    [10.8, 40.8]
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
  await Promise.all([Trail.deleteMany({}), TrailStatusHistory.deleteMany({})])
})

function change(trail, previousStatus, newStatus, reason, changedAt) {
  return TrailStatusHistory.create({
    trail: trail._id,
    previousStatus,
    newStatus,
    reason,
    changedAt
  })
}

async function listProperties() {
  const res = await request(app).get(`/api/trails?bbox=${BBOX}`)
  return res.body.features.map((feature) => feature.properties)
}

describe('the reason a trail is not free', () => {
  it('is returned with a trail that is at risk, from its latest status change', async () => {
    const trail = await Trail.create({ name: 'Ceda', path, status: 'at_risk' })
    await change(trail, 'free', 'closed', 'Old reason', new Date('2026-10-01T10:00:00Z'))
    await change(trail, 'closed', 'at_risk', 'Fallen tree after the storm', new Date('2026-10-02'))

    const [properties] = await listProperties()

    expect(properties.statusReason).toBe('Fallen tree after the storm')
    expect(new Date(properties.statusChangedAt).toISOString()).toBe('2026-10-02T00:00:00.000Z')
  })

  it('is also returned by the detail of a trail', async () => {
    const trail = await Trail.create({ name: 'Ceda', path, status: 'closed' })
    await change(trail, 'free', 'closed', 'Landslide on the path')

    const res = await request(app).get(`/api/trails/${trail._id}`)

    expect(res.body.properties.statusReason).toBe('Landslide on the path')
  })

  it('is not returned for a free trail, even if it was closed before', async () => {
    const trail = await Trail.create({ name: 'Lago', path, status: 'free' })
    await change(trail, 'free', 'closed', 'Reopened since')
    await change(trail, 'closed', 'free', 'Path cleared')

    const [properties] = await listProperties()

    expect(properties.statusReason).toBeUndefined()
    expect(properties.statusChangedAt).toBeUndefined()
  })

  it('is not returned when the latest change does not match the current status', async () => {
    const trail = await Trail.create({ name: 'Ceda', path, status: 'closed' })
    await change(trail, 'free', 'at_risk', 'Reason of an older status')

    const [properties] = await listProperties()

    expect(properties.statusReason).toBeUndefined()
  })

  it('is not returned for a trail whose status was never changed', async () => {
    await Trail.create({ name: 'Ceda', path, status: 'at_risk' })

    const [properties] = await listProperties()

    expect(properties.statusReason).toBeUndefined()
  })

  it('keeps each trail with its own reason', async () => {
    const ceda = await Trail.create({ name: 'Ceda', path, status: 'at_risk' })
    const lago = await Trail.create({ name: 'Lago', path, status: 'crowded' })
    await Trail.create({ name: 'Bosco', path, status: 'free' })
    await change(ceda, 'free', 'at_risk', 'Reason of the Ceda')
    await change(lago, 'free', 'crowded', 'Reason of the Lago')

    const properties = await listProperties()
    const reasonOf = (name) => properties.find((trail) => trail.name === name).statusReason

    expect(reasonOf('Ceda')).toBe('Reason of the Ceda')
    expect(reasonOf('Lago')).toBe('Reason of the Lago')
    expect(reasonOf('Bosco')).toBeUndefined()
  })

  it('does not reveal who changed the status', async () => {
    const trail = await Trail.create({ name: 'Ceda', path, status: 'at_risk' })
    await change(trail, 'free', 'at_risk', 'Reason')

    const [properties] = await listProperties()

    expect(JSON.stringify(properties)).not.toContain('changedBy')
  })
})
