import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import ReportPhoto from '../../models/ReportPhoto.js'

const ALLOWED_FORMATS = ['jpeg', 'png', 'webp']
const JPEG_QUALITY = 80
const MAX_INPUT_PIXELS = 100_000_000
export const PHOTO_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/

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
        withoutEnlargement: true
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
  } catch (err) {
    if (err instanceof InvalidPhotoError) throw err
    throw new InvalidPhotoError('The file could not be read as an image')
  }
}

export function photoIdFromFilename(filename) {
  return filename.slice(0, -'.jpg'.length)
}

export async function storeReportPhoto(jpeg) {
  const id = randomUUID()
  await ReportPhoto.create({ _id: id, data: jpeg })

  return `${PHOTO_URL_PREFIX}${id}.jpg`
}

export async function saveReportPhoto(buffer) {
  return storeReportPhoto(await processReportPhoto(buffer))
}

export async function deleteAllReportPhotos() {
  await ReportPhoto.deleteMany({})
}

export async function deleteReportPhoto(photoUrl) {
  if (typeof photoUrl !== 'string' || !photoUrl.startsWith(PHOTO_URL_PREFIX)) return

  const filename = photoUrl.slice(PHOTO_URL_PREFIX.length)
  if (!PHOTO_FILENAME_PATTERN.test(filename)) return

  await ReportPhoto.deleteOne({ _id: photoIdFromFilename(filename) })
}
