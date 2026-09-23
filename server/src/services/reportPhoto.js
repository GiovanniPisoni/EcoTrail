import { randomUUID } from 'node:crypto'
import { mkdir, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { getUploadsDir } from '../config/uploads.js'

const REPORTS_SUBDIR = 'reports'
const ALLOWED_FORMATS = ['jpeg', 'png', 'webp']
const JPEG_QUALITY = 80
const MAX_INPUT_PIXELS = 100_000_000
const PHOTO_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/

export const PHOTO_URL_PREFIX = '/api/uploads/reports/'
export const MAX_PHOTO_DIMENSION = 1280

export class InvalidPhotoError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidPhotoError'
  }
}

export async function processReportPhoto(buffer) {
  try {
    const image = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })

    const { format } = await image.metadata()
    if (!ALLOWED_FORMATS.includes(format)) {
      throw new InvalidPhotoError('Photo must be a JPEG, PNG or WebP image')
    }

    return await image
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({
        width: MAX_PHOTO_DIMENSION,
        height: MAX_PHOTO_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
  } catch (err) {
    if (err instanceof InvalidPhotoError) throw err
    throw new InvalidPhotoError('The file could not be read as an image')
  }
}

export async function storeReportPhoto(jpeg) {
  const directory = path.join(getUploadsDir(), REPORTS_SUBDIR)
  await mkdir(directory, { recursive: true })

  const filename = `${randomUUID()}.jpg`
  await writeFile(path.join(directory, filename), jpeg)

  return `${PHOTO_URL_PREFIX}${filename}`
}

export async function saveReportPhoto(buffer) {
  return storeReportPhoto(await processReportPhoto(buffer))
}

export async function deleteAllReportPhotos() {
  await rm(path.join(getUploadsDir(), REPORTS_SUBDIR), { recursive: true, force: true })
}

export async function deleteReportPhoto(photoUrl) {
  if (typeof photoUrl !== 'string' || !photoUrl.startsWith(PHOTO_URL_PREFIX)) return

  const filename = photoUrl.slice(PHOTO_URL_PREFIX.length)
  if (!PHOTO_FILENAME_PATTERN.test(filename)) return

  try {
    await unlink(path.join(getUploadsDir(), REPORTS_SUBDIR, filename))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}
