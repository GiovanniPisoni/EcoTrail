export function formatDistance(distanceKm) {
  return typeof distanceKm === 'number' ? `${distanceKm.toFixed(1)} km` : '-'
}

export function formatDuration(durationMinutes) {
  if (typeof durationMinutes !== 'number') return '-'
  const hours = Math.floor(durationMinutes / 60)
  const minutes = Math.round(durationMinutes % 60)
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`
}
