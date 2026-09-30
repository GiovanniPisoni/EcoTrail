const ICON_PENDING =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>'

const ICON_VALIDATED =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'

const ICON_REJECTED =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'

const ICON_WITHDRAWN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>'

export const REPORT_VALIDATION_STATUSES = {
  pending: { label: 'Pending', color: '#F59E0B', icon: ICON_PENDING },
  validated: { label: 'Validated', color: '#10B981', icon: ICON_VALIDATED },
  rejected: { label: 'Rejected', color: '#EF4444', icon: ICON_REJECTED },
  withdrawn: { label: 'Withdrawn', color: '#6B7280', icon: ICON_WITHDRAWN }
}

export const REPORT_VALIDATION_STATUS_OPTIONS = Object.entries(REPORT_VALIDATION_STATUSES).map(
  ([value, { label }]) => ({ value, label })
)
