import UserPresence from '../../models/UserPresence.js'
import { activeSince } from './userPresence.js'

export const DEFAULT_SEARCH_RADIUS_METERS = 1000

const METERS_PER_DEGREE = 111320
const BOUNDING_BOX_SLACK = 0.05

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

function distanceToSegmentMeters(point, start, end) {
  const [pointLon, pointLat] = point
  const metersPerDegreeLon = METERS_PER_DEGREE * Math.cos(toRadians(pointLat))

  const toPlane = ([lon, lat]) => [
    (lon - pointLon) * metersPerDegreeLon,
    (lat - pointLat) * METERS_PER_DEGREE
  ]
  const [ax, ay] = toPlane(start)
  const [bx, by] = toPlane(end)

  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared))

  return Math.hypot(ax + t * dx, ay + t * dy)
}

export function distanceToLineMeters(point, lineCoordinates) {
  if (lineCoordinates.length === 1) {
    return distanceToSegmentMeters(point, lineCoordinates[0], lineCoordinates[0])
  }

  let shortest = Infinity
  for (let i = 0; i < lineCoordinates.length - 1; i++) {
    shortest = Math.min(
      shortest,
      distanceToSegmentMeters(point, lineCoordinates[i], lineCoordinates[i + 1])
    )
  }
  return shortest
}

function expandedBoundingBox(coordinates, radiusMeters) {
  const lons = coordinates.map(([lon]) => lon)
  const lats = coordinates.map(([, lat]) => lat)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)

  const slack = Math.max(maxLon - minLon, maxLat - minLat) * BOUNDING_BOX_SLACK
  const latMargin = radiusMeters / METERS_PER_DEGREE + slack
  const widestLat = Math.min(89, Math.max(Math.abs(minLat), Math.abs(maxLat)) + latMargin)
  const lonMargin = radiusMeters / (METERS_PER_DEGREE * Math.cos(toRadians(widestLat))) + slack

  const west = Math.max(-180, minLon - lonMargin)
  const east = Math.min(180, maxLon + lonMargin)
  const south = Math.max(-90, minLat - latMargin)
  const north = Math.min(90, maxLat + latMargin)

  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south]
      ]
    ]
  }
}

async function findNearPoint(point, radiusMeters, since) {
  const presences = await UserPresence.aggregate([
    {
      $geoNear: {
        near: point,
        distanceField: 'distanceMeters',
        maxDistance: radiusMeters,
        spherical: true,
        query: { updatedAt: { $gte: since } }
      }
    }
  ])

  return presences.map((presence) => ({
    userId: presence.user,
    distanceMeters: presence.distanceMeters
  }))
}

async function findNearLine(line, radiusMeters, since) {
  const candidates = await UserPresence.find({
    updatedAt: { $gte: since },
    location: { $geoWithin: { $geometry: expandedBoundingBox(line.coordinates, radiusMeters) } }
  })

  return candidates
    .map((presence) => ({
      userId: presence.user,
      distanceMeters: distanceToLineMeters(presence.location.coordinates, line.coordinates)
    }))
    .filter((match) => match.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
}

export async function findNearbyUsers(
  geometry,
  { radiusMeters = DEFAULT_SEARCH_RADIUS_METERS, now = new Date() } = {}
) {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    throw new RangeError('radiusMeters must be a positive number')
  }

  const since = activeSince(now)

  if (geometry?.type === 'Point') return findNearPoint(geometry, radiusMeters, since)
  if (geometry?.type === 'LineString') return findNearLine(geometry, radiusMeters, since)

  throw new TypeError('geometry must be a GeoJSON Point or LineString')
}
