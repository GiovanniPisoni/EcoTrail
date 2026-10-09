import express from 'express'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_CLIENT_DIST = fileURLToPath(new URL('../../../client/dist', import.meta.url))

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60

export function getClientDist() {
  return process.env.CLIENT_DIST ? path.resolve(process.env.CLIENT_DIST) : DEFAULT_CLIENT_DIST
}

function setCacheHeaders(res, filePath) {
  const isHashedAsset = filePath.split(path.sep).includes('assets')
  res.setHeader(
    'Cache-Control',
    isHashedAsset ? `public, max-age=${ONE_YEAR_SECONDS}, immutable` : 'no-cache'
  )
}

export function createClientRouter(distDir = getClientDist()) {
  const indexFile = path.join(distDir, 'index.html')
  if (!existsSync(indexFile)) return null

  const router = express.Router()

  router.use(express.static(distDir, { index: 'index.html', setHeaders: setCacheHeaders }))

  router.get(/^\/(?!api\/|socket\.io\/)[^.]*$/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(indexFile)
  })

  return router
}
