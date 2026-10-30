import ReportPhoto from '../models/ReportPhoto.js'
import { PHOTO_FILENAME_PATTERN, photoIdFromFilename } from '../services/reports/reportPhoto.js'

const CACHE_CONTROL = 'public, max-age=604800, immutable'

export async function serveReportPhoto(req, res, next) {
  try {
    if (!PHOTO_FILENAME_PATTERN.test(req.params.filename)) return res.sendStatus(404)

    const photo = await ReportPhoto.findById(photoIdFromFilename(req.params.filename))
    if (!photo) return res.sendStatus(404)

    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff'
    })
    res.send(photo.data)
  } catch (err) {
    next(err)
  }
}
