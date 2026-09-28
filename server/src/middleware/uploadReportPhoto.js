import multer from 'multer'

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 10, fieldSize: 10 * 1024 },
}).single('photo')

export function uploadReportPhoto(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next()

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res
          .status(413)
          .json({ error: `Photo is too large (maximum ${MAX_PHOTO_BYTES / 1024 / 1024} MB)` })
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Send a single image in the "photo" field' })
      }
    }

    return res.status(400).json({ error: 'Invalid upload request' })
  })
}
