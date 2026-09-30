import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {
  InvalidPhotoError,
  MAX_PHOTO_DIMENSION,
  PHOTO_URL_PREFIX,
  deleteAllReportPhotos,
  deleteReportPhoto,
  saveReportPhoto
} from '../src/services/reportPhoto.js'

let uploadsDir
let originalUploadsDir

function solid(width, height, options = {}) {
  return sharp({
    create: { width, height, channels: 3, background: options.background ?? '#336699' }
  })
}

function pathOf(photoUrl) {
  return path.join(uploadsDir, 'reports', photoUrl.slice(PHOTO_URL_PREFIX.length))
}

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

beforeAll(async () => {
  originalUploadsDir = process.env.UPLOADS_DIR
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'ecotrail-uploads-'))
  process.env.UPLOADS_DIR = uploadsDir
})

afterAll(async () => {
  if (originalUploadsDir === undefined) {
    delete process.env.UPLOADS_DIR
  } else {
    process.env.UPLOADS_DIR = originalUploadsDir
  }
  await rm(uploadsDir, { recursive: true, force: true })
})

describe('saveReportPhoto', () => {
  it('shrinks a photo of several MB to a few hundred KB', async () => {
    const bigPhoto = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        noise: { type: 'gaussian', mean: 128, sigma: 30 }
      }
    })
      .jpeg({ quality: 85 })
      .toBuffer()
    expect(bigPhoto.length).toBeGreaterThan(3 * 1024 * 1024)

    const photoUrl = await saveReportPhoto(bigPhoto)

    const saved = await readFile(pathOf(photoUrl))
    const metadata = await sharp(saved).metadata()
    expect(saved.length).toBeLessThan(400 * 1024)
    expect(metadata.format).toBe('jpeg')
    expect(Math.max(metadata.width, metadata.height)).toBe(MAX_PHOTO_DIMENSION)
    expect(metadata.width / metadata.height).toBeCloseTo(4000 / 3000, 2)
  })

  it('returns a random URL under the uploads prefix and writes the file', async () => {
    const buffer = await solid(300, 200).jpeg().toBuffer()

    const first = await saveReportPhoto(buffer)
    const second = await saveReportPhoto(buffer)

    expect(first).toMatch(/^\/api\/uploads\/reports\/[0-9a-f-]{36}\.jpg$/)
    expect(first).not.toBe(second)
    expect(await exists(pathOf(first))).toBe(true)
    expect(await exists(pathOf(second))).toBe(true)
  })

  it('does not enlarge small photos', async () => {
    const photoUrl = await saveReportPhoto(await solid(300, 200).jpeg().toBuffer())

    const metadata = await sharp(pathOf(photoUrl)).metadata()
    expect([metadata.width, metadata.height]).toEqual([300, 200])
  })

  it('removes the EXIF metadata (GPS position, phone model)', async () => {
    const withExif = await solid(800, 600)
      .withExif({ IFD0: { Make: 'TestPhone', Model: 'X1' } })
      .jpeg()
      .toBuffer()
    expect((await sharp(withExif).metadata()).exif).toBeDefined()

    const photoUrl = await saveReportPhoto(withExif)

    const saved = await readFile(pathOf(photoUrl))
    expect((await sharp(saved).metadata()).exif).toBeUndefined()
    expect(saved.includes(Buffer.from('TestPhone'))).toBe(false)
  })

  it('applies the EXIF orientation before removing it, so the photo is not sideways', async () => {
    const sideways = await solid(400, 200).withMetadata({ orientation: 6 }).jpeg().toBuffer()
    const before = await sharp(sideways).metadata()
    expect([before.width, before.height, before.orientation]).toEqual([400, 200, 6])

    const photoUrl = await saveReportPhoto(sideways)

    const after = await sharp(pathOf(photoUrl)).metadata()
    expect([after.width, after.height]).toEqual([200, 400])
    expect(after.orientation).toBeUndefined()
  })

  it('accepts PNG and WebP and always saves a JPEG', async () => {
    for (const buffer of [
      await solid(100, 100).png().toBuffer(),
      await solid(100, 100).webp().toBuffer()
    ]) {
      const photoUrl = await saveReportPhoto(buffer)
      expect((await sharp(pathOf(photoUrl)).metadata()).format).toBe('jpeg')
    }
  })

  it('puts transparent PNGs on a white background', async () => {
    const transparent = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } }
    })
      .png()
      .toBuffer()

    const photoUrl = await saveReportPhoto(transparent)

    const { data } = await sharp(pathOf(photoUrl)).raw().toBuffer({ resolveWithObject: true })
    expect([data[0], data[1], data[2]].every((value) => value > 240)).toBe(true)
  })

  describe('rejects files that are not usable photos', () => {
    it('rejects data that is not an image', async () => {
      await expect(saveReportPhoto(Buffer.from('this is not an image'))).rejects.toThrow(
        InvalidPhotoError
      )
    })

    it('rejects an empty file', async () => {
      await expect(saveReportPhoto(Buffer.alloc(0))).rejects.toThrow(InvalidPhotoError)
    })

    it('rejects image formats that are not allowed', async () => {
      const tiff = await solid(100, 100).tiff().toBuffer()

      await expect(saveReportPhoto(tiff)).rejects.toThrow('JPEG, PNG or WebP')
    })

    it('rejects a truncated image', async () => {
      const jpeg = await solid(1000, 1000, { background: '#88aa66' }).jpeg().toBuffer()

      await expect(saveReportPhoto(jpeg.subarray(0, 200))).rejects.toThrow(InvalidPhotoError)
    })
  })
})

describe('deleteAllReportPhotos', () => {
  it('removes every saved photo but leaves the rest of the uploads folder alone', async () => {
    const first = await saveReportPhoto(await solid(100, 100).jpeg().toBuffer())
    const second = await saveReportPhoto(await solid(100, 100).jpeg().toBuffer())
    const other = path.join(uploadsDir, 'other-file.txt')
    await writeFile(other, 'not a report photo')

    await deleteAllReportPhotos()

    expect(await exists(pathOf(first))).toBe(false)
    expect(await exists(pathOf(second))).toBe(false)
    expect(await exists(other)).toBe(true)
  })

  it('does nothing when there are no photos yet', async () => {
    await deleteAllReportPhotos()

    await expect(deleteAllReportPhotos()).resolves.toBeUndefined()
  })
})

describe('deleteReportPhoto', () => {
  it('deletes a saved photo', async () => {
    const photoUrl = await saveReportPhoto(await solid(100, 100).jpeg().toBuffer())

    await deleteReportPhoto(photoUrl)

    expect(await exists(pathOf(photoUrl))).toBe(false)
  })

  it('does nothing when the file is already gone', async () => {
    const photoUrl = `${PHOTO_URL_PREFIX}00000000-0000-0000-0000-000000000000.jpg`

    await expect(deleteReportPhoto(photoUrl)).resolves.toBeUndefined()
  })

  it('never deletes anything outside the reports folder', async () => {
    const decoy = path.join(uploadsDir, 'secret.txt')
    await writeFile(decoy, 'keep me')

    for (const url of [
      `${PHOTO_URL_PREFIX}../secret.txt`,
      '/api/uploads/reports/../secret.txt',
      '/api/uploads/secret.txt',
      decoy,
      '',
      undefined,
      null
    ]) {
      await expect(deleteReportPhoto(url)).resolves.toBeUndefined()
    }

    expect(await exists(decoy)).toBe(true)
  })
})
