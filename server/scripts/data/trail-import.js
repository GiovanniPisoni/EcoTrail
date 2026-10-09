import { computeDistanceKm } from './enrich-trails.js'

const EARTH_RADIUS_M = 6371008.8
const COORDINATE_DECIMALS = 6
const MIN_PLAUSIBLE_SPEED_KMH = 1
const MAX_PLAUSIBLE_SPEED_KMH = 8

export const DEFAULT_EXCLUSIONS = {
  names: new Set([
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
  ]),
  ids: new Set(['way/1546714306', 'way/1546714314'])
}

export function selectTrailFeatures(rawGeojson, exclusions = DEFAULT_EXCLUSIONS) {
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
    if (exclusions.ids.has(id)) return true
    return (f.properties['@relations'] ?? []).some((r) => relationIdsPresent.has(r.rel))
  }

  const stage1 = named.filter(
    (f) => !exclusions.names.has(f.properties.name) && !isDuplicateOfRelation(f)
  )

  const nameCounts = new Map()
  for (const f of stage1) {
    nameCounts.set(f.properties.name, (nameCounts.get(f.properties.name) ?? 0) + 1)
  }

  return stage1.filter((f) => {
    if (nameCounts.get(f.properties.name) > 1) return false
    const isWay = f.properties['@id'].startsWith('way/')
    if (isWay && !f.properties.sac_scale) return false
    return true
  })
}

function metersPerDegree(latitude) {
  const metersPerDegreeLatitude = (Math.PI / 180) * EARTH_RADIUS_M
  return {
    x: metersPerDegreeLatitude * Math.cos((latitude * Math.PI) / 180),
    y: metersPerDegreeLatitude
  }
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1])

  const t = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)
  )
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy))
}

export function simplifyLine(coordinates, toleranceMeters) {
  if (!toleranceMeters || coordinates.length < 3) return coordinates

  const scale = metersPerDegree(coordinates[0][1])
  const projected = coordinates.map(([lng, lat]) => [lng * scale.x, lat * scale.y])
  const keep = new Array(coordinates.length).fill(false)
  keep[0] = true
  keep[coordinates.length - 1] = true

  const stack = [[0, coordinates.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()
    let farthest = -1
    let farthestDistance = 0

    for (let i = first + 1; i < last; i++) {
      const distance = distanceToSegment(projected[i], projected[first], projected[last])
      if (distance > farthestDistance) {
        farthestDistance = distance
        farthest = i
      }
    }

    if (farthest !== -1 && farthestDistance > toleranceMeters) {
      keep[farthest] = true
      stack.push([first, farthest], [farthest, last])
    }
  }

  return coordinates.filter((_, index) => keep[index])
}

function roundCoordinates(coordinates) {
  const factor = 10 ** COORDINATE_DECIMALS
  return coordinates.map(([lng, lat]) => [
    Math.round(lng * factor) / factor,
    Math.round(lat * factor) / factor
  ])
}

// CAI scale: T tourist, E hiking, EE experts, EEA experts with equipment
export function difficultyFromCaiScale(caiScale) {
  if (typeof caiScale !== 'string') return undefined

  const grades = caiScale
    .toUpperCase()
    .split(/[;,/\s]+/)
    .filter(Boolean)
  if (grades.some((grade) => grade === 'EE' || grade === 'EEA')) return 'hard'
  if (grades.includes('E')) return 'medium'
  if (grades.includes('T')) return 'easy'
  return undefined
}

// OSM duration is "H:MM" or "H:MM:SS"
export function parseOsmDurationMinutes(duration) {
  if (typeof duration !== 'string') return undefined

  const match = duration.trim().match(/^(\d{1,3}):(\d{2})(?::\d{2})?$/)
  if (!match) return undefined

  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes > 0 ? Math.round(minutes / 5) * 5 || 5 : undefined
}

function isPlausibleDuration(durationMinutes, distanceKm) {
  if (!durationMinutes || !distanceKm) return false
  const speedKmh = distanceKm / (durationMinutes / 60)
  return speedKmh >= MIN_PLAUSIBLE_SPEED_KMH && speedKmh <= MAX_PLAUSIBLE_SPEED_KMH
}

export function featureToTrail(feature, { simplifyMeters = 0 } = {}) {
  const originalCoordinates = feature.geometry.coordinates
  const distanceKm = computeDistanceKm(originalCoordinates)
  const properties = feature.properties

  const trail = {
    name: properties.name,
    path: {
      type: 'LineString',
      coordinates: roundCoordinates(simplifyLine(originalCoordinates, simplifyMeters))
    },
    status: 'free',
    distanceKm
  }

  const difficulty = difficultyFromCaiScale(properties.cai_scale)
  if (difficulty) trail.difficulty = difficulty

  const durationMinutes = parseOsmDurationMinutes(
    properties['duration:forward'] ?? properties.duration
  )
  if (isPlausibleDuration(durationMinutes, distanceKm)) trail.durationMinutes = durationMinutes

  return trail
}

export function importTrails(rawGeojson, { exclusions, simplifyMeters = 0 } = {}) {
  return selectTrailFeatures(rawGeojson, exclusions).map((feature) =>
    featureToTrail(feature, { simplifyMeters })
  )
}
