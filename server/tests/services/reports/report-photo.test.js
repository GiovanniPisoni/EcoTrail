import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import sharp from 'sharp'
import ReportPhoto from '../../../src/models/ReportPhoto.js'
import {
  InvalidPhotoError,
  MAX_PHOTO_DIMENSION,
  PHOTO_URL_PREFIX,
  deleteAllReportPhotos,
  deleteReportPhoto,
  saveReportPhoto
} from '../../../src/services/reports/reportPhoto.js'

let mongod

function solid(width, height, options = {}) {
  return sharp({
    create: { width, height, channels: 3, background: options.background ?? '#336699' }
  })
}

async function savedPhoto(photoUrl) {
  const photo = await ReportPhoto.findById(photoUrl.slice(PHOTO_URL_PREFIX.length, -'.jpg'.length))
  return photo?.data
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
  await ReportPhoto.deleteMany({})
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

    const saved = await savedPhoto(photoUrl)
    const metadata = await sharp(saved).metadata()
    expect(saved.length).toBeLessThan(400 * 1024)
    expect(metadata.format).toBe('jpeg')
    expect(Math.max(metadata.width, metadata.height)).toBe(MAX_PHOTO_DIMENSION)
    expect(metadata.width / metadata.height).toBeCloseTo(4000 / 3000, 2)
  })

  it('returns a random URL under the photos prefix and saves the image', async () => {
    const buffer = await solid(300, 200).jpeg().toBuffer()

    const first = await saveReportPhoto(buffer)
    const second = await saveReportPhoto(buffer)

    expect(first).toMatch(/^\/api\/uploads\/reports\/[0-9a-f-]{36}\.jpg$/)
    expect(first).not.toBe(second)
    expect(await savedPhoto(first)).toBeDefined()
    expect(await savedPhoto(second)).toBeDefined()
  })

  it('does not enlarge small photos', async () => {
    const photoUrl = await saveReportPhoto(await solid(300, 200).jpeg().toBuffer())

    const metadata = await sharp(await savedPhoto(photoUrl)).metadata()
    expect([metadata.width, metadata.height]).toEqual([300, 200])
  })

  it('removes the EXIF metadata (GPS position, phone model)', async () => {
    const withExif = await solid(800, 600)
      .withExif({ IFD0: { Make: 'TestPhone', Model: 'X1' } })
      .jpeg()
      .toBuffer()
    expect((await sharp(withExif).metadata()).exif).toBeDefined()

    const photoUrl = await saveReportPhoto(withExif)

    const saved = await savedPhoto(photoUrl)
    expect((await sharp(saved).metadata()).exif).toBeUndefined()
    expect(saved.includes(Buffer.from('TestPhone'))).toBe(false)
  })

  it('applies the EXIF orientation before removing it, so the photo is not sideways', async () => {
    const sideways = await solid(400, 200).withMetadata({ orientation: 6 }).jpeg().toBuffer()
    const before = await sharp(sideways).metadata()
    expect([before.width, before.height, before.orientation]).toEqual([400, 200, 6])

    const photoUrl = await saveReportPhoto(sideways)

    const after = await sharp(await savedPhoto(photoUrl)).metadata()
    expect([after.width, after.height]).toEqual([200, 400])
    expect(after.orientation).toBeUndefined()
  })

  it('accepts PNG and WebP and always saves a JPEG', async () => {
    for (const buffer of [
      await solid(100, 100).png().toBuffer(),
      await solid(100, 100).webp().toBuffer()
    ]) {
      const photoUrl = await saveReportPhoto(buffer)
      expect((await sharp(await savedPhoto(photoUrl)).metadata()).format).toBe('jpeg')
    }
  })

  it('puts transparent PNGs on a white background', async () => {
    const transparent = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } }
    })
      .png()
      .toBuffer()

    const photoUrl = await saveReportPhoto(transparent)

    const { data } = await sharp(await savedPhoto(photoUrl))
      .raw()
      .toBuffer({ resolveWithObject: true })
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

    it('saves nothing when the file is rejected', async () => {
      await expect(saveReportPhoto(Buffer.from('not an image'))).rejects.toThrow()

      expect(await ReportPhoto.countDocuments()).toBe(0)
    })
  })
})

describe('deleteAllReportPhotos', () => {
  it('removes every saved photo', async () => {
    const first = await saveReportPhoto(await solid(100, 100).jpeg().toBuffer())
    const second = await saveReportPhoto(await solid(100, 100).jpeg().toBuffer())

    await deleteAllReportPhotos()

    expect(await savedPhoto(first)).toBeUndefined()
    expect(await savedPhoto(second)).toBeUndefined()
  })

  it('does nothing when there are no photos yet', async () => {
    await expect(deleteAllReportPhotos()).resolves.toBeUndefined()
  })
})

describe('deleteReportPhoto', () => {
  it('deletes a saved photo and keeps the others', async () => {
    const photoUrl = await saveReportPhoto(await solid(100, 100).jpeg().toBuffer())
    const other = await saveReportPhoto(await solid(100, 100).jpeg().toBuffer())

    await deleteReportPhoto(photoUrl)

    expect(await savedPhoto(photoUrl)).toBeUndefined()
    expect(await savedPhoto(other)).toBeDefined()
  })

  it('does nothing when the photo is already gone', async () => {
    const photoUrl = `${PHOTO_URL_PREFIX}00000000-0000-0000-0000-000000000000.jpg`

    await expect(deleteReportPhoto(photoUrl)).resolves.toBeUndefined()
  })

  it('ignores anything that is not the URL of a saved photo', async () => {
    const photoUrl = await saveReportPhoto(await solid(100, 100).jpeg().toBuffer())

    for (const url of [
      `${PHOTO_URL_PREFIX}../secret.txt`,
      '/api/uploads/secret.txt',
      '/api/uploads/reports/not-a-photo.jpg',
      '',
      undefined,
      null
    ]) {
      await expect(deleteReportPhoto(url)).resolves.toBeUndefined()
    }

    expect(await savedPhoto(photoUrl)).toBeDefined()
  })
})
