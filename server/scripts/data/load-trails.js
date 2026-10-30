import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { enrichTrail } from './enrich-trails.js'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data')

export function trailDataFiles(dataDir = DATA_DIR) {
  return readdirSync(dataDir)
    .filter((file) => /^trails-[a-z0-9-]+\.json$/.test(file))
    .sort()
    .map((file) => path.join(dataDir, file))
}

export function loadTrails(dataDir = DATA_DIR) {
  const seen = new Set()

  return trailDataFiles(dataDir)
    .flatMap((file) => JSON.parse(readFileSync(file, 'utf-8')))
    .filter((trail) => {
      if (seen.has(trail.name)) return false
      seen.add(trail.name)
      return true
    })
    .map(enrichTrail)
}
