import express from 'express'
import { getUploadsDir } from '../config/uploads.js'

const options = {
  maxAge: '7d',
  immutable: true,
  index: false,
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
}

let cached = { dir: null, handler: null }

export function serveUploads(req, res, next) {
  const dir = getUploadsDir()
  if (cached.dir !== dir) {
    cached = { dir, handler: express.static(dir, options) }
  }
  cached.handler(req, res, next)
}
