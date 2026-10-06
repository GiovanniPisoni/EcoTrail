import Report, { REPORT_TYPES } from '../models/Report.js'
import Trail from '../models/Trail.js'
import TrailStatusHistory from '../models/TrailStatusHistory.js'
import { trailEvents, TRAIL_STATUS_CHANGED } from './trailEvents.js'

export const ALERT_DEFAULTS = {
  riskCount: 3,
  closeCount: 5,
  windowHours: 6,
  radiusMeters: 500
}
export const MIN_RELIABLE_TRUST = 2
export const HAZARD_TYPES = REPORT_TYPES.filter((type) => type !== 'overcrowding')

const HOUR_MS = 60 * 60 * 1000
const EARTH_RADIUS_METERS = 6378100
const COUNTING_STATUSES = ['pending', 'validated']
const AUTO_RISK_FROM = ['free', 'crowded']

export function getAlertRules(trail) {
  const overrides = trail.alertRules ?? {}
  return {
    riskCount: overrides.riskCount ?? ALERT_DEFAULTS.riskCount,
    closeCount: overrides.closeCount ?? ALERT_DEFAULTS.closeCount,
    windowHours: overrides.windowHours ?? ALERT_DEFAULTS.windowHours,
    radiusMeters: overrides.radiusMeters ?? ALERT_DEFAULTS.radiusMeters
  }
}

async function lastAdminChangeAt(trailId) {
  const entry = await TrailStatusHistory.findOne({ trail: trailId, changedBy: { $ne: null } })
    .sort({ changedAt: -1 })
    .select('changedAt')
    .lean()
  return entry?.changedAt
}

async function countsFrom(trail, now, windowHours) {
  const dates = [new Date(now.getTime() - windowHours * HOUR_MS)]
  const adminChange = await lastAdminChangeAt(trail._id)
  if (adminChange) dates.push(adminChange)
  if (trail.closureDismissedAt) dates.push(trail.closureDismissedAt)
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}

async function setAtRisk(trail, reason) {
  const updated = await Trail.findOneAndUpdate(
    { _id: trail._id, status: trail.status },
    { status: 'at_risk' }
  )
  if (!updated) return false

  const entry = await TrailStatusHistory.create({
    trail: trail._id,
    previousStatus: trail.status,
    newStatus: 'at_risk',
    reason,
    changedBy: null
  })

  trailEvents.emit(TRAIL_STATUS_CHANGED, {
    trailId: trail._id,
    trailName: trail.name,
    previousStatus: trail.status,
    newStatus: 'at_risk',
    reason,
    changedBy: null,
    historyEntryId: entry._id
  })
  return true
}

async function proposeClosure(trail, reason, reportCount, now) {
  const result = await Trail.updateOne(
    { _id: trail._id, closureProposal: { $exists: false } },
    { $set: { closureProposal: { reason, reportCount, proposedAt: now } } }
  )
  return result.modifiedCount === 1
}

export async function evaluateTrailAlert(report, { now = new Date() } = {}) {
  const outcome = { markedAtRisk: false, proposedClosure: false }

  const trail = await Trail.findById(report.trail?._id ?? report.trail)
  if (!trail || trail.status === 'closed') return outcome

  const rules = getAlertRules(trail)
  const since = await countsFrom(trail, now, rules.windowHours)
  const [longitude, latitude] = report.location.coordinates

  const reliable = await Report.find({
    trail: trail._id,
    type: { $in: HAZARD_TYPES },
    validationStatus: { $in: COUNTING_STATUSES },
    isSuspicious: { $ne: true },
    trustScore: { $gte: MIN_RELIABLE_TRUST },
    createdAt: { $gte: since },
    location: {
      $geoWithin: {
        $centerSphere: [[longitude, latitude], rules.radiusMeters / EARTH_RADIUS_METERS]
      }
    }
  })
    .select('severity')
    .lean()

  const highSeverityCount = reliable.filter((item) => item.severity === 'high').length
  const description = (count, label) =>
    `Automatic: ${count} reliable ${label} within ${rules.radiusMeters} m in the last ${rules.windowHours} h`

  if (reliable.length >= rules.riskCount && AUTO_RISK_FROM.includes(trail.status)) {
    outcome.markedAtRisk = await setAtRisk(trail, description(reliable.length, 'reports'))
  }

  if (highSeverityCount >= rules.closeCount && !trail.closureProposal) {
    outcome.proposedClosure = await proposeClosure(
      trail,
      description(highSeverityCount, 'high-severity reports'),
      highSeverityCount,
      now
    )
  }

  return outcome
}

export async function evaluateTrailAlertSafely(report) {
  try {
    return await evaluateTrailAlert(report)
  } catch (err) {
    console.error('[auto-alert] could not evaluate the reports:', err.message)
    return null
  }
}
