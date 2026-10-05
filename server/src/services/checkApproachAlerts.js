import Trail from '../models/Trail.js'
import Report from '../models/Report.js'
import SentAlert from '../models/SentAlert.js'
import User from '../models/User.js'
import { sendPush } from './sendPush.js'

export const DANGEROUS_TRAIL_STATUSES = ['at_risk', 'closed']
export const SERIOUS_REPORT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const STATUS_LABELS = { at_risk: 'at risk', closed: 'closed' }
const REPORT_TYPE_LABELS = {
  fallen_tree: 'Fallen tree',
  landslide: 'Landslide',
  flooding: 'Flooding',
  vegetation_damage: 'Damaged vegetation',
  other: 'Hazard'
}
const DUPLICATE_KEY_ERROR = 11000

function nearGeometry(point, radiusMeters) {
  return { $near: { $geometry: point, $maxDistance: radiusMeters } }
}

async function claimAlert(user, trailId, status, reportId) {
  const key = { user: user._id, trail: trailId, status, ...(reportId && { report: reportId }) }

  try {
    const result = await SentAlert.updateOne(key, {}, { upsert: true })
    return result.upsertedCount === 1
  } catch (err) {
    if (err.code === DUPLICATE_KEY_ERROR) return false
    throw err
  }
}

async function sendAlert(user, { trailId, status, reportId, payload }) {
  if (!(await claimAlert(user, trailId, status, reportId))) return false

  try {
    await sendPush(user, payload, { type: 'approach', trail: trailId })
    return true
  } catch (err) {
    console.error(`[approach] push to user ${user._id} failed:`, err.message)
    return false
  }
}

function trailAlert(trail) {
  return {
    trailId: trail._id,
    status: trail.status,
    payload: {
      title: 'Trail alert',
      body: `You are close to "${trail.name}", which is ${STATUS_LABELS[trail.status]}.`,
      url: `/?trail=${trail._id}`
    }
  }
}

function reportAlert(report) {
  const label = REPORT_TYPE_LABELS[report.type] ?? REPORT_TYPE_LABELS.other
  return {
    trailId: report.trail._id,
    status: 'report',
    reportId: report._id,
    payload: {
      title: 'Hazard nearby',
      body: `${label} reported on "${report.trail.name}", close to you.`,
      url: `/?trail=${report.trail._id}`
    }
  }
}

export async function checkApproachAlerts(
  userId,
  { latitude, longitude },
  { now = new Date() } = {}
) {
  const user = await User.findById(userId)
  if (!user || user.pushSubscriptions.length === 0) return 0
  if (!user.notificationPreferences.alertTypes.includes('approach')) return 0

  const point = { type: 'Point', coordinates: [longitude, latitude] }
  const radiusMeters = user.notificationPreferences.radiusMeters

  const [trails, reports] = await Promise.all([
    Trail.find({
      status: { $in: DANGEROUS_TRAIL_STATUSES },
      path: nearGeometry(point, radiusMeters)
    })
      .select('name status')
      .lean(),
    Report.find({
      validationStatus: 'validated',
      severity: 'high',
      type: { $ne: 'overcrowding' },
      createdAt: { $gte: new Date(now.getTime() - SERIOUS_REPORT_MAX_AGE_MS) },
      location: nearGeometry(point, radiusMeters)
    })
      .populate('trail', 'name')
      .lean()
  ])

  const alerts = [...trails.map(trailAlert), ...reports.map(reportAlert)]

  let sent = 0
  for (const alert of alerts) {
    if (await sendAlert(user, alert)) sent++
  }
  return sent
}
