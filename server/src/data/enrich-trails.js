const EARTH_RADIUS_KM = 6371
const EASY_MAX_KM = 6
const MEDIUM_MAX_KM = 14
const HARD_NAME_KEYWORDS = ['attrezzato', 'alpinistico', 'canalone']
const WALKING_SPEED_KMH = { easy: 4, medium: 3, hard: 2.5 }

export const PLACEHOLDER_PHOTO_URL = '/images/trail-placeholder.jpg'

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

function haversineKm([lng1, lat1], [lng2, lat2]) {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

export function computeDistanceKm(coordinates) {
  let km = 0
  for (let i = 1; i < coordinates.length; i++) {
    km += haversineKm(coordinates[i - 1], coordinates[i])
  }
  return Math.round(km * 10) / 10
}

export function estimateDifficulty(name, distanceKm) {
  const lowerName = name.toLowerCase()
  if (HARD_NAME_KEYWORDS.some((keyword) => lowerName.includes(keyword))) return 'hard'
  if (distanceKm < EASY_MAX_KM) return 'easy'
  if (distanceKm <= MEDIUM_MAX_KM) return 'medium'
  return 'hard'
}

export function estimateDurationMinutes(distanceKm, difficulty) {
  const minutes = (distanceKm / WALKING_SPEED_KMH[difficulty]) * 60
  return Math.round(minutes / 5) * 5
}

export function enrichTrail(trail) {
  const distanceKm = trail.distanceKm ?? computeDistanceKm(trail.path.coordinates)
  const difficulty = trail.difficulty ?? estimateDifficulty(trail.name, distanceKm)

  return {
    ...trail,
    distanceKm,
    difficulty,
    durationMinutes: trail.durationMinutes ?? estimateDurationMinutes(distanceKm, difficulty),
    photoUrl: trail.photoUrl ?? PLACEHOLDER_PHOTO_URL
  }
}
