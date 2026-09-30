import Trail from '../models/Trail.js'

export const MAX_TRAIL_DISTANCE_METERS = 200

export async function findNearestTrail(
  latitude,
  longitude,
  maxDistanceMeters = MAX_TRAIL_DISTANCE_METERS
) {
  return Trail.findOne({
    path: {
      $near: {
        $geometry: { type: 'Point', coordinates: [longitude, latitude] },
        $maxDistance: maxDistanceMeters
      }
    }
  }).select('name')
}
