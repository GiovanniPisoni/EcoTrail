import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../../src/index.js'
import Trail from '../../src/models/Trail.js'
import { MAX_TRAILS_PER_REQUEST } from '../../src/routes/trails.js'

let mongod

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  await Trail.deleteMany({})
})

const BBOX = '10,40,11,41'

describe('GET /api/trails', () => {
  it('returns trails that intersect the requested bbox, even partially', async () => {
    await Trail.create([
      {
        name: 'Dentro il rettangolo',
        path: {
          type: 'LineString',
          coordinates: [
            [10.2, 40.2],
            [10.8, 40.8]
          ]
        }
      },
      {
        name: 'Fuori dal rettangolo',
        path: {
          type: 'LineString',
          coordinates: [
            [20, 50],
            [20.1, 50.1]
          ]
        }
      },
      {
        name: 'A cavallo del bordo',
        path: {
          type: 'LineString',
          coordinates: [
            [10.5, 40.5],
            [12, 42]
          ]
        }
      }
    ])

    const res = await request(app).get('/api/trails').query({ bbox: BBOX })

    expect(res.status).toBe(200)
    expect(res.body.type).toBe('FeatureCollection')
    const names = res.body.features.map((f) => f.properties.name).sort()
    expect(names).toEqual(['A cavallo del bordo', 'Dentro il rettangolo'])
  })

  it('excludes trails that do not touch the requested bbox at all', async () => {
    await Trail.create({
      name: 'Completamente fuori',
      path: {
        type: 'LineString',
        coordinates: [
          [20, 50],
          [20.1, 50.1]
        ]
      }
    })

    const res = await request(app).get('/api/trails').query({ bbox: BBOX })

    expect(res.status).toBe(200)
    expect(res.body.features).toHaveLength(0)
  })

  it('changes the results when the requested bbox changes', async () => {
    await Trail.create({
      name: 'Sentiero unico',
      path: {
        type: 'LineString',
        coordinates: [
          [10.2, 40.2],
          [10.8, 40.8]
        ]
      }
    })

    const inside = await request(app).get('/api/trails').query({ bbox: BBOX })
    const outside = await request(app).get('/api/trails').query({ bbox: '20,50,21,51' })

    expect(inside.body.features).toHaveLength(1)
    expect(outside.body.features).toHaveLength(0)
  })

  it('filters by status when provided', async () => {
    await Trail.create([
      {
        name: 'Libero',
        status: 'free',
        path: {
          type: 'LineString',
          coordinates: [
            [10.1, 40.1],
            [10.2, 40.2]
          ]
        }
      },
      {
        name: 'Chiuso',
        status: 'closed',
        path: {
          type: 'LineString',
          coordinates: [
            [10.3, 40.3],
            [10.4, 40.4]
          ]
        }
      }
    ])

    const res = await request(app).get('/api/trails').query({ bbox: BBOX, status: 'closed' })

    expect(res.status).toBe(200)
    expect(res.body.features).toHaveLength(1)
    expect(res.body.features[0].properties.status).toBe('closed')
  })

  it('returns 400 without a bbox', async () => {
    const res = await request(app).get('/api/trails')
    expect(res.status).toBe(400)
  })

  it('returns 400 for a malformed bbox', async () => {
    const res = await request(app).get('/api/trails').query({ bbox: '10,40,11' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when west/south are not less than east/north', async () => {
    const res = await request(app).get('/api/trails').query({ bbox: '11,41,10,40' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid status value', async () => {
    const res = await request(app).get('/api/trails').query({ bbox: BBOX, status: 'unicorn' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/trails/:id', () => {
  it('returns the trail as a GeoJSON Feature', async () => {
    const trail = await Trail.create({
      name: 'Sentiero di dettaglio',
      path: {
        type: 'LineString',
        coordinates: [
          [10.1, 40.1],
          [10.2, 40.2]
        ]
      }
    })

    const res = await request(app).get(`/api/trails/${trail._id}`)

    expect(res.status).toBe(200)
    expect(res.body.type).toBe('Feature')
    expect(res.body.properties.name).toBe('Sentiero di dettaglio')
    expect(res.body.properties.fragileSegments).toBeDefined()
  })

  it('returns 404 for a well-formed id that does not exist', async () => {
    const missingId = new mongoose.Types.ObjectId()
    const res = await request(app).get(`/api/trails/${missingId}`)
    expect(res.status).toBe(404)
  })

  it('returns 400 for a malformed id', async () => {
    const res = await request(app).get('/api/trails/not-an-id')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/trails limit', () => {
  it('returns at most MAX_TRAILS_PER_REQUEST trails for a crowded bbox', async () => {
    await Trail.insertMany(
      Array.from({ length: MAX_TRAILS_PER_REQUEST + 1 }, (_, index) => ({
        name: `Trail ${index}`,
        path: {
          type: 'LineString',
          coordinates: [
            [10.2, 40.2],
            [10.3, 40.3]
          ]
        }
      }))
    )

    const res = await request(app).get('/api/trails').query({ bbox: BBOX })

    expect(res.status).toBe(200)
    expect(res.body.features).toHaveLength(MAX_TRAILS_PER_REQUEST)
  })
})
