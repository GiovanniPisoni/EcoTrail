export const TRAIL_DIFFICULTIES = {
  easy: { label: 'Easy', color: '#10B981' },
  medium: { label: 'Medium', color: '#FBBF24' },
  hard: { label: 'Hard', color: '#EF4444' }
}

const UNKNOWN_COLOR = '#9CA3AF'

export function getTrailDifficultyColor(difficulty) {
  return TRAIL_DIFFICULTIES[difficulty]?.color ?? UNKNOWN_COLOR
}

export function getTrailDifficultyLabel(difficulty) {
  return TRAIL_DIFFICULTIES[difficulty]?.label ?? 'Unknown'
}
