export const NOTIFICATION_TYPES = {
  emergency: {
    label: 'Emergency',
    description: 'A trail near you becomes at risk or closed.'
  },
  approach: {
    label: 'Approaching danger',
    description: 'You get close to a risky or closed trail, or to a serious report.'
  },
  overcrowd: {
    label: 'Crowded trails',
    description: 'A trail near you gets crowded, with a quieter alternative.'
  }
}

export const MUTE_LABELS = {
  60: 'For 1 hour',
  480: 'For 8 hours',
  1440: 'For 24 hours'
}

export function getNotificationTypeLabel(type) {
  return NOTIFICATION_TYPES[type]?.label ?? type
}

export function formatRadius(meters) {
  return meters < 1000 ? `${meters} m` : `${meters / 1000} km`
}
