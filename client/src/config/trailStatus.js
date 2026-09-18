
export const TRAIL_STATUSES = {
  free: { label: 'Free', color: '#2e7d32' },
  crowded: { label: 'Crowded', color: '#f57c00' },
  at_risk: { label: 'At risk', color: '#c62828' },
  closed: { label: 'Closed', color: '#616161' },
}

export function getTrailStatusColor(status) {
  return TRAIL_STATUSES[status]?.color ?? TRAIL_STATUSES.free.color
}

export function getTrailStatusLabel(status) {
  return TRAIL_STATUSES[status]?.label ?? status
}
