import mongoose from 'mongoose'
import Report from '../models/Report.js'
import Trail from '../models/Trail.js'
import TrailActivity from '../models/TrailActivity.js'
import TrailStatusHistory from '../models/TrailStatusHistory.js'
import NotificationLog from '../models/NotificationLog.js'
import { STATS_TIMEZONE } from './statsPeriod.js'

export const HEATMAP_MAX_POINTS = 5000
export const EVENTS_LIMIT = 200
export const EVENT_KINDS = ['closure', 'alert', 'notification']

const SEVERITY_INTENSITY = { low: 0.3, medium: 0.6, high: 1 }
const EXCLUDED_REPORT_STATUSES = ['rejected', 'withdrawn']
const AUTOMATIC_ALERT_STATUSES = ['crowded', 'at_risk']

function inPeriod(field, { start, end }) {
  return { [field]: { $gte: start, $lt: end } }
}

export async function getAttendance(period, trailId = null) {
  const match = { ...inPeriod('hour', period) }
  if (trailId) match.trail = new mongoose.Types.ObjectId(trailId)

  const [perTrail, perHour] = await Promise.all([
    TrailActivity.aggregate([
      { $match: match },
      { $unwind: '$users' },
      { $group: { _id: { trail: '$trail', user: '$users' } } },
      { $group: { _id: '$_id.trail', hikers: { $sum: 1 } } }
    ]),
    TrailActivity.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $hour: { date: '$hour', timezone: STATS_TIMEZONE } },
          hikers: { $sum: { $size: '$users' } }
        }
      }
    ])
  ])

  const trails = await Trail.find({ _id: { $in: perTrail.map((row) => row._id) } })
    .select('name')
    .lean()
  const names = new Map(trails.map((trail) => [String(trail._id), trail.name]))

  const hikersByHour = new Map(perHour.map((row) => [row._id, row.hikers]))

  return {
    trails: perTrail
      .map((row) => ({
        trailId: row._id,
        name: names.get(String(row._id)) ?? 'Unknown',
        hikers: row.hikers
      }))
      .sort((a, b) => b.hikers - a.hikers || a.name.localeCompare(b.name)),
    byHour: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      hikers: hikersByHour.get(hour) ?? 0
    }))
  }
}

export async function getHeatmap(period) {
  const reports = await Report.find({
    ...inPeriod('createdAt', period),
    isSuspicious: { $ne: true },
    validationStatus: { $nin: EXCLUDED_REPORT_STATUSES }
  })
    .select('location severity')
    .limit(HEATMAP_MAX_POINTS)
    .lean()

  return reports.map((report) => [
    report.location.coordinates[1],
    report.location.coordinates[0],
    SEVERITY_INTENSITY[report.severity] ?? SEVERITY_INTENSITY.medium
  ])
}

function historyEntryToEvent(entry, trailNames) {
  const isClosure = entry.newStatus === 'closed'
  return {
    kind: isClosure ? 'closure' : 'alert',
    at: entry.changedAt,
    trail: { id: entry.trail, name: trailNames.get(String(entry.trail)) ?? 'Unknown' },
    detail: entry.reason,
    count: entry.alertedCount ?? 0
  }
}

export async function getEvents(period, kind = null) {
  const closureFilter = { ...inPeriod('changedAt', period), newStatus: 'closed' }
  const alertFilter = {
    ...inPeriod('changedAt', period),
    changedBy: null,
    newStatus: { $in: AUTOMATIC_ALERT_STATUSES }
  }
  const notificationFilter = inPeriod('sentAt', period)

  const [closures, alerts, notifications] = await Promise.all([
    TrailStatusHistory.countDocuments(closureFilter),
    TrailStatusHistory.countDocuments(alertFilter),
    NotificationLog.countDocuments(notificationFilter)
  ])

  const wantsHistory = !kind || kind === 'closure' || kind === 'alert'
  const wantsNotifications = !kind || kind === 'notification'

  let historyFilter = { $or: [closureFilter, alertFilter] }
  if (kind === 'closure') historyFilter = closureFilter
  if (kind === 'alert') historyFilter = alertFilter

  const [history, grouped] = await Promise.all([
    wantsHistory
      ? TrailStatusHistory.find(historyFilter).sort({ changedAt: -1 }).limit(EVENTS_LIMIT).lean()
      : [],
    wantsNotifications
      ? NotificationLog.aggregate([
          { $match: notificationFilter },
          {
            $group: {
              _id: {
                type: '$type',
                trail: '$relatedTrail',
                minute: { $dateTrunc: { date: '$sentAt', unit: 'minute' } }
              },
              recipients: { $sum: 1 },
              message: { $first: '$message' }
            }
          },
          { $sort: { '_id.minute': -1 } },
          { $limit: EVENTS_LIMIT }
        ])
      : []
  ])

  const trailIds = [
    ...history.map((entry) => entry.trail),
    ...grouped.map((row) => row._id.trail).filter(Boolean)
  ]
  const trails = await Trail.find({ _id: { $in: trailIds } })
    .select('name')
    .lean()
  const trailNames = new Map(trails.map((trail) => [String(trail._id), trail.name]))

  const events = [
    ...history.map((entry) => historyEntryToEvent(entry, trailNames)),
    ...grouped.map((row) => ({
      kind: 'notification',
      at: row._id.minute,
      trail: row._id.trail
        ? { id: row._id.trail, name: trailNames.get(String(row._id.trail)) ?? 'Unknown' }
        : null,
      detail: row.message,
      count: row.recipients
    }))
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, EVENTS_LIMIT)

  return { totals: { closures, alerts, notifications }, events }
}
