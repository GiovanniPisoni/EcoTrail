import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { importTrails } from './trail-import.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const USAGE =
  'Usage: node import-trails.js <overpass-export.geojson> <area> [--simplify=<meters>]\n' +
  'Example: node import-trails.js server/data/raw/trento.geojson trento --simplify=10'

const args = process.argv.slice(2)
const simplifyFlag = args.find((arg) => arg.startsWith('--simplify='))
const [inputPath, area] = args.filter((arg) => !arg.startsWith('--'))

if (!inputPath || !area || !/^[a-z0-9-]+$/.test(area)) {
  console.error(USAGE)
  process.exit(1)
}

const simplifyMeters = simplifyFlag ? Number(simplifyFlag.split('=')[1]) : 0
if (!Number.isFinite(simplifyMeters) || simplifyMeters < 0) {
  console.error('--simplify must be a number of meters, 0 or more')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(inputPath, 'utf-8'))
const trails = importTrails(raw, { simplifyMeters })

const outputPath = path.join(__dirname, '..', '..', 'data', `trails-${area}.json`)
writeFileSync(outputPath, JSON.stringify(trails) + '\n')

console.log(`${trails.length} trails written to ${outputPath}`)
