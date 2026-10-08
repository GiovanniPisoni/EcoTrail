import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BIKE_PARK_NAMES = new Set([
  'Matrix by Merida',
  'Blade Runner',
  'Goonies',
  'Duel',
  'Easy Rider',
  'Willy Wonka',
  'Hustle&Flow',
  'Interstellar by Endura',
  'Supernatural by Pirelli',
  'Big Hero',
  '805 "Secret Trail"'
])

const EXTRA_DUPLICATE_IDS = new Set(['way/1546714306', 'way/1546714314'])

function clean(rawGeojson) {
  const linestrings = rawGeojson.features.filter((f) => f.geometry.type === 'LineString')
  const named = linestrings.filter((f) => f.properties.name)

  const relationIdsPresent = new Set(
    named
      .filter((f) => f.properties['@id'].startsWith('relation/'))
      .map((f) => Number(f.properties['@id'].split('/')[1]))
  )

  const isDuplicateOfRelation = (f) => {
    const id = f.properties['@id']
    if (!id.startsWith('way/')) return false
    if (EXTRA_DUPLICATE_IDS.has(id)) return true
    return (f.properties['@relations'] ?? []).some((r) => relationIdsPresent.has(r.rel))
  }

  const stage1 = named.filter(
    (f) => !BIKE_PARK_NAMES.has(f.properties.name) && !isDuplicateOfRelation(f)
  )

  const nameCounts = new Map()
  for (const f of stage1) {
    nameCounts.set(f.properties.name, (nameCounts.get(f.properties.name) ?? 0) + 1)
  }
  const fragmentedNames = new Set([...nameCounts].filter(([, count]) => count > 1).map(([n]) => n))

  return stage1
    .filter((f) => {
      if (fragmentedNames.has(f.properties.name)) return false
      const isWay = f.properties['@id'].startsWith('way/')
      if (isWay && !f.properties.sac_scale) return false
      return true
    })
    .map((f) => ({
      name: f.properties.name,
      path: { type: 'LineString', coordinates: f.geometry.coordinates },
      status: 'free'
    }))
}

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Uso: node import-trails.js <percorso-export-overpass.geojson>')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(inputPath, 'utf-8'))
const trails = clean(raw)

const outputPath = path.join(__dirname, '..', '..', 'data', 'trails-andalo.json')
writeFileSync(outputPath, JSON.stringify(trails, null, 2) + '\n')

console.log(`${trails.length} sentieri puliti scritti in ${outputPath}`)
