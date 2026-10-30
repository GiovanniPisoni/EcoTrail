const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'

const ICON_USERS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'

const ICON_WARNING =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'

const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'

export const TRAIL_STATUSES = {
  free: { label: 'Open', color: '#10B981', icon: ICON_CHECK, hint: 'Open and free to use.' },
  crowded: {
    label: 'Crowded',
    color: '#8B5CF6',
    icon: ICON_USERS,
    hint: 'Open, but busy right now.'
  },
  at_risk: {
    label: 'At risk',
    color: '#F97316',
    icon: ICON_WARNING,
    hint: 'Open, but dangerous: take care.'
  },
  closed: {
    label: 'Closed',
    color: '#EF4444',
    icon: ICON_CLOSE,
    hint: 'Closed: do not use this trail.'
  }
}

export function getTrailStatusColor(status) {
  return TRAIL_STATUSES[status]?.color ?? TRAIL_STATUSES.free.color
}

export function getTrailStatusLabel(status) {
  return TRAIL_STATUSES[status]?.label ?? status
}

export function getTrailStatusHint(status) {
  return TRAIL_STATUSES[status]?.hint ?? ''
}

export function getTrailStatusIcon(status) {
  return TRAIL_STATUSES[status]?.icon ?? TRAIL_STATUSES.free.icon
}
