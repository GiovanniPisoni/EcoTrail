export const RADIUS_OPTIONS_METERS = [500, 1000, 2000, 5000]
export const MAX_RADIUS_METERS = Math.max(...RADIUS_OPTIONS_METERS)

export const MUTE_OPTIONS_MINUTES = [60, 480, 1440]
export const MUTED_INDEFINITELY_UNTIL = new Date(8.64e15)

export function isMuted(preferences, now = new Date()) {
  return Boolean(preferences?.mutedUntil) && preferences.mutedUntil > now
}

export function isMutedIndefinitely(preferences) {
  return Boolean(preferences?.mutedUntil) && preferences.mutedUntil >= MUTED_INDEFINITELY_UNTIL
}
