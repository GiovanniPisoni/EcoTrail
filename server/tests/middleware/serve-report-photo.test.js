import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import sharp from 'sharp'
import app from '../../src/index.js'
import ReportPhoto from '../../src/models/ReportPhoto.js'
import { PHOTO_URL_PREFIX, saveReportPhoto } from '../../src/services/reports/reportPhoto.js'

let mongod

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

describe('GET /api/uploads/reports', () => {
  it('serves a saved photo as an immutable, cacheable JPEG', async () => {
    const jpeg = await sharp({
      create: { width: 200, height: 100, channels: 3, background: '#336699' }
    })
      .jpeg()
      .toBuffer()
    const photoUrl = await saveReportPhoto(jpeg)

    const res = await request(app).get(photoUrl)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['cache-control']).toContain('max-age=604800')
    expect(res.headers['cache-control']).toContain('immutable')
    expect(res.headers['x-content-type-options']).toBe('nosniff')

    const id = photoUrl.slice(PHOTO_URL_PREFIX.length, -'.jpg'.length)
    const saved = await ReportPhoto.findById(id)
    expect(Buffer.compare(res.body, saved.data)).toBe(0)
    expect((await sharp(res.body).metadata()).format).toBe('jpeg')
  })

  it('returns 404 for a photo that does not exist', async () => {
    const res = await request(app).get(
      `${PHOTO_URL_PREFIX}00000000-0000-0000-0000-000000000000.jpg`
    )

    expect(res.status).toBe(404)
  })

  it.each(['anything.jpg', '..%2Fsecret.jpg', '%2e%2e%2f', 'x.png'])(
    'returns 404 for a name that is not a photo (%s)',
    async (name) => {
      const res = await request(app).get(`${PHOTO_URL_PREFIX}${name}`)

      expect(res.status).toBe(404)
    }
  )

  it('does not list the photos', async () => {
    const res = await request(app).get(PHOTO_URL_PREFIX)

    expect(res.status).toBe(404)
  })
})
