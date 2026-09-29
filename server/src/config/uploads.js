import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_UPLOADS_DIR = fileURLToPath(new URL('../../uploads', import.meta.url))

export function getUploadsDir() {
  return process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : DEFAULT_UPLOADS_DIR
}
