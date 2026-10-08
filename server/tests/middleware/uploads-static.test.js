import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import sharp from 'sharp'
import app from '../../src/index.js'
import { PHOTO_URL_PREFIX, saveReportPhoto } from '../../src/services/reports/reportPhoto.js'

let uploadsDir
let originalUploadsDir
let decoyFile

beforeAll(async () => {
  originalUploadsDir = process.env.UPLOADS_DIR
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'ecotrail-uploads-'))
  process.env.UPLOADS_DIR = uploadsDir

  decoyFile = `${uploadsDir}-decoy.txt`
  await writeFile(decoyFile, 'secret outside the uploads folder')
})

afterAll(async () => {
  if (originalUploadsDir === undefined) {
    delete process.env.UPLOADS_DIR
  } else {
    process.env.UPLOADS_DIR = originalUploadsDir
  }
  await rm(uploadsDir, { recursive: true, force: true })
  await rm(decoyFile, { force: true })
})

describe('GET /api/uploads', () => {
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

    const onDisk = await readFile(
      path.join(uploadsDir, 'reports', photoUrl.slice(PHOTO_URL_PREFIX.length))
    )
    expect(Buffer.compare(res.body, onDisk)).toBe(0)
    expect((await sharp(res.body).metadata()).format).toBe('jpeg')
  })

  it('returns 404 for a photo that does not exist', async () => {
    const res = await request(app).get(
      `${PHOTO_URL_PREFIX}00000000-0000-0000-0000-000000000000.jpg`
    )

    expect(res.status).toBe(404)
  })

  it('does not list the content of a folder', async () => {
    await saveReportPhoto(
      await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ffffff' } })
        .jpeg()
        .toBuffer()
    )

    const res = await request(app).get(PHOTO_URL_PREFIX)

    expect(res.status).toBe(404)
  })

  it.each(['..%2F', '%2e%2e/', '%2e%2e%2f'])(
    'never serves files outside the uploads folder (%s)',
    async (up) => {
      const decoyName = path.basename(decoyFile)

      const res = await request(app).get(`/api/uploads/${up}${decoyName}`)

      expect(res.status).not.toBe(200)
      expect(res.text ?? '').not.toContain('secret outside')
    }
  )

  it('answers 404 when the uploads folder does not exist yet', async () => {
    const previous = process.env.UPLOADS_DIR
    process.env.UPLOADS_DIR = path.join(uploadsDir, 'not-created-yet')

    const res = await request(app).get(`${PHOTO_URL_PREFIX}anything.jpg`)

    process.env.UPLOADS_DIR = previous
    expect(res.status).toBe(404)
  })
})
