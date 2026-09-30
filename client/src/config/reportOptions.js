export const REPORT_TYPES = [
  'fallen_tree',
  'landslide',
  'flooding',
  'vegetation_damage',
  'overcrowding',
  'other'
]

export const REPORT_SEVERITIES = ['low', 'medium', 'high']

const ICON_FALLEN_TREE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/></svg>'

const ICON_LANDSLIDE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20 9 8l4 6 3-5 5 11Z"/><circle cx="6" cy="18" r="0.8" fill="currentColor" stroke="none"/><circle cx="4.3" cy="19.5" r="0.6" fill="currentColor" stroke="none"/></svg>'

const ICON_FLOODING =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0"/><path d="M2 19c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0"/></svg>'

const ICON_VEGETATION_DAMAGE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-4-2-7-6-7-11a7 7 0 0 1 14 0c0 5-3 9-7 11Z"/><path d="M9 12l2-2 1 3 2-2"/></svg>'

const ICON_OVERCROWDING =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'

const ICON_OTHER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>'

export const REPORT_TYPE_OPTIONS = [
  { value: 'fallen_tree', label: 'Fallen tree', icon: ICON_FALLEN_TREE },
  { value: 'landslide', label: 'Landslide', icon: ICON_LANDSLIDE },
  { value: 'flooding', label: 'Flooding', icon: ICON_FLOODING },
  { value: 'vegetation_damage', label: 'Vegetation damage', icon: ICON_VEGETATION_DAMAGE },
  { value: 'overcrowding', label: 'Overcrowding', icon: ICON_OVERCROWDING },
  { value: 'other', label: 'Other', icon: ICON_OTHER }
]

export const REPORT_SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low', color: '#10B981' },
  { value: 'medium', label: 'Medium', color: '#FBBF24' },
  { value: 'high', label: 'High', color: '#EF4444' }
]
