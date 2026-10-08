import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import sharp from 'sharp'
import app from '../../src/index.js'
import User from '../../src/models/User.js'
import Trail from '../../src/models/Trail.js'
import Report from '../../src/models/Report.js'
import { MAX_PHOTO_BYTES } from '../../src/middleware/uploadReportPhoto.js'
import { PHOTO_URL_PREFIX } from '../../src/services/reports/reportPhoto.js'

const JWT_SECRET = 'test-secret'

const validFields = {
  type: 'fallen_tree',
  severity: 'medium',
  description: 'Big pine across the path',
  latitude: 46.1805,
  longitude: 10.905
}

let mongod
let uploadsDir
let originalUploadsDir
let smallJpeg
let bigJpeg

function trailAt(name, latitude) {
  return {
    name,
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, latitude],
        [10.91, latitude]
      ]
    }
  }
}

async function createUserAndToken() {
  const user = await User.create({
    email: 'hiker@ecotrail.test',
    password: 'hashed',
    role: 'hiker'
  })
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  return { user, token }
}

function submit(token, { fields = validFields, photo, field = 'photo' } = {}) {
  const req = request(app).post('/api/reports')
  if (token) req.set('Authorization', `Bearer ${token}`)
  for (const [key, value] of Object.entries(fields)) req.field(key, String(value))
  if (photo) req.attach(field, photo, { filename: 'photo.jpg', contentType: 'image/jpeg' })
  return req
}

async function storedFiles() {
  return readdir(path.join(uploadsDir, 'reports')).catch(() => [])
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET
  originalUploadsDir = process.env.UPLOADS_DIR
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'ecotrail-uploads-'))
  process.env.UPLOADS_DIR = uploadsDir

  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Trail.init()

  smallJpeg = await sharp({
    create: { width: 800, height: 600, channels: 3, background: '#336699' }
  })
    .jpeg()
    .toBuffer()
  bigJpeg = await sharp({
    create: {
      width: 4000,
      height: 3000,
      channels: 3,
      noise: { type: 'gaussian', mean: 128, sigma: 30 }
    }
  })
    .jpeg({ quality: 85 })
    .toBuffer()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
  if (originalUploadsDir === undefined) {
    delete process.env.UPLOADS_DIR
  } else {
    process.env.UPLOADS_DIR = originalUploadsDir
  }
  await rm(uploadsDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Trail.deleteMany({}), Report.deleteMany({})])
  await rm(path.join(uploadsDir, 'reports'), { recursive: true, force: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/reports with a photo', () => {
  it('stores the photo on disk and returns its URL', async () => {
    const { token } = await createUserAndToken()
    await Trail.create(trailAt('Near trail', 46.18))

    const res = await submit(token, { photo: smallJpeg })

    expect(res.status).toBe(201)
    expect(res.body.photoUrl).toMatch(/^\/api\/uploads\/reports\/[0-9a-f-]{36}\.jpg$/)

    const files = await storedFiles()
    expect(files).toEqual([res.body.photoUrl.slice(PHOTO_URL_PREFIX.length)])

    const saved = await Report.findById(res.body.id)
    expect(saved.photoUrl).toBe(res.body.photoUrl)
  })

  it('makes the returned photo URL open the stored image', async () => {
    const { token } = await createUserAndToken()
    await Trail.create(trailAt('Near trail', 46.18))
    const created = await submit(token, { photo: smallJpeg })

    const res = await request(app).get(created.body.photoUrl)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    const metadata = await sharp(res.body).metadata()
    expect([metadata.width, metadata.height]).toEqual([800, 600])
  })

  it('shrinks a photo of several MB to a few hundred KB', async () => {
    const { token } = await createUserAndToken()
    await Trail.create(trailAt('Near trail', 46.18))
    expect(bigJpeg.length).toBeGreaterThan(3 * 1024 * 1024)

    const res = await submit(token, { photo: bigJpeg })

    expect(res.status).toBe(201)
    const [file] = await storedFiles()
    const stored = await readFile(path.join(uploadsDir, 'reports', file))
    const metadata = await sharp(stored).metadata()
    expect(stored.length).toBeLessThan(400 * 1024)
    expect(Math.max(metadata.width, metadata.height)).toBe(1280)
  })

  it('still accepts a multipart report without a photo', async () => {
    const { token } = await createUserAndToken()
    await Trail.create(trailAt('Near trail', 46.18))

    const res = await submit(token)

    expect(res.status).toBe(201)
    expect(res.body.photoUrl).toBeUndefined()
    expect(res.body.latitude).toBe(46.1805)
    expect(await storedFiles()).toEqual([])
  })

  it('rejects a file that is not an image and saves nothing', async () => {
    const { token } = await createUserAndToken()
    await Trail.create(trailAt('Near trail', 46.18))

    const res = await submit(token, { photo: Buffer.from('definitely not an image') })

    expect(res.status).toBe(400)
    expect(res.body.details.photo).toBeDefined()
    expect(await Report.countDocuments()).toBe(0)
    expect(await storedFiles()).toEqual([])
  })

  it('reports the photo error together with the other invalid fields', async () => {
    const { token } = await createUserAndToken()

    const res = await submit(token, {
      fields: { ...validFields, type: 'tree' },
      photo: Buffer.from('definitely not an image')
    })

    expect(res.status).toBe(400)
    expect(Object.keys(res.body.details).sort()).toEqual(['photo', 'type'])
  })

  it('rejects a photo larger than the limit with 413', async () => {
    const { token } = await createUserAndToken()
    await Trail.create(trailAt('Near trail', 46.18))

    const res = await submit(token, { photo: Buffer.alloc(MAX_PHOTO_BYTES + 1) })

    expect(res.status).toBe(413)
    expect(res.body.error).toContain('10 MB')
    expect(await Report.countDocuments()).toBe(0)
    expect(await storedFiles()).toEqual([])
  })

  it('rejects a file sent in the wrong field', async () => {
    const { token } = await createUserAndToken()
    await Trail.create(trailAt('Near trail', 46.18))

    const res = await submit(token, { photo: smallJpeg, field: 'picture' })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('"photo" field')
    expect(await Report.countDocuments()).toBe(0)
  })

  it('rejects more than one photo', async () => {
    const { token } = await createUserAndToken()
    await Trail.create(trailAt('Near trail', 46.18))

    const res = await submit(token, { photo: smallJpeg }).attach('photo', smallJpeg, {
      filename: 'second.jpg',
      contentType: 'image/jpeg'
    })

    expect(res.status).toBe(400)
    expect(await Report.countDocuments()).toBe(0)
    expect(await storedFiles()).toEqual([])
  })

  it('stores nothing when no trail is within range', async () => {
    const { token } = await createUserAndToken()
    await Trail.create(trailAt('Far trail', 46.2))

    const res = await submit(token, { photo: smallJpeg })

    expect(res.status).toBe(422)
    expect(await Report.countDocuments()).toBe(0)
    expect(await storedFiles()).toEqual([])
  })

  it('deletes the stored photo when the report cannot be saved', async () => {
    const { token } = await createUserAndToken()
    await Trail.create(trailAt('Near trail', 46.18))
    vi.spyOn(Report, 'create').mockRejectedValueOnce(new Error('database is down'))

    const res = await submit(token, { photo: smallJpeg })

    expect(res.status).toBe(500)
    expect(await storedFiles()).toEqual([])
  })

  it('requires authentication before touching the upload', async () => {
    await Trail.create(trailAt('Near trail', 46.18))

    const res = await submit(undefined, { photo: smallJpeg })

    expect(res.status).toBe(401)
    expect(await storedFiles()).toEqual([])
  })
})
