import 'dotenv/config'
import mongoose from 'mongoose'
import Trail from '../../src/models/Trail.js'
import User from '../../src/models/User.js'
import Report, { REPORT_SEVERITIES, REPORT_TYPES } from '../../src/models/Report.js'
import TrailActivity from '../../src/models/TrailActivity.js'
import TrailStatusHistory from '../../src/models/TrailStatusHistory.js'
import Notification from '../../src/models/Notification.js'
import { STATS_TIMEZONE, zonedTime } from '../../src/services/stats/statsPeriod.js'

const SIMULATED_EMAIL_DOMAIN = '@simulated.ecotrail.test'
const MARKER = '[sim]'
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_DAYS = 14
const DEFAULT_USERS = 40
const ACTIVE_TRAILS = 25
const POPULARITY_DECAY = 0.8
const MIN_AUDIENCE = 3

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: STATS_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short'
})

function localDay(timestamp) {
  const parts = Object.fromEntries(
    dayFormatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value])
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekend: ['Sat', 'Sun'].includes(parts.weekday)
  }
}

const HOUR_WEIGHTS = {
  6: 0.2,
  7: 0.5,
  8: 1,
  9: 1.6,
  10: 2,
  11: 1.7,
  12: 1,
  13: 0.8,
  14: 1.3,
  15: 1.5,
  16: 1,
  17: 0.5,
  18: 0.2
}

function parseArgs(argv) {
  const options = { days: DEFAULT_DAYS, users: DEFAULT_USERS, cleanup: false, validated: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days') options.days = Number(argv[++i])
    else if (argv[i] === '--users') options.users = Number(argv[++i])
    else if (argv[i] === '--cleanup') options.cleanup = true
    else if (argv[i] === '--validated') options.validated = true
  }
  return options
}

function usage() {
  console.log('Usage:')
  console.log('  npm run simulate:stats -w server -- [--days <n>] [--users <n>] [--validated]')
  console.log('  npm run simulate:stats -w server -- --cleanup')
}

const random = (min, max) => min + Math.random() * (max - min)
const pick = (list) => list[Math.floor(Math.random() * list.length)]

function pickSome(list, count) {
  const copy = [...list]
  const chosen = []
  while (chosen.length < count && copy.length > 0) {
    chosen.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0])
  }
  return chosen
}

function pointAlong(coordinates) {
  const position = Math.random() * (coordinates.length - 1)
  const lower = Math.floor(position)
  const upper = Math.min(lower + 1, coordinates.length - 1)
  const fraction = position - lower
  const [lonA, latA] = coordinates[lower]
  const [lonB, latB] = coordinates[upper]
  return [lonA + (lonB - lonA) * fraction, latA + (latB - latA) * fraction]
}

async function removeSimulated() {
  const users = await User.find({ email: { $regex: `${SIMULATED_EMAIL_DOMAIN}$` } }).select('_id')
  const ids = users.map((user) => user._id)

  await TrailActivity.updateMany({}, { $pull: { users: { $in: ids } } })
  await TrailActivity.deleteMany({ users: { $size: 0 } })
  await Promise.all([
    Report.deleteMany({ author: { $in: ids } }),
    TrailStatusHistory.deleteMany({ reason: { $regex: '^\\[sim\\]' } }),
    Notification.deleteMany({ user: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } })
  ])
  return ids.length
}

async function createUsers(count) {
  const created = await User.insertMany(
    Array.from({ length: count }, (_, i) => ({
      email: `stats-${i + 1}${SIMULATED_EMAIL_DOMAIN}`,
      password: 'simulated'
    }))
  )
  return created.map((user) => user._id)
}

async function simulateActivity(trails, userIds, days) {
  const ranked = pickSome(trails, ACTIVE_TRAILS)
  const audiences = new Map(
    ranked.map((trail, rank) => {
      const share = 1 / (rank + 1) ** POPULARITY_DECAY
      const size = Math.max(MIN_AUDIENCE, Math.round(userIds.length * share))
      return [String(trail._id), pickSome(userIds, size)]
    })
  )
  const operations = []
  const now = Date.now()

  for (let day = days; day >= 0; day--) {
    const dayStart = now - day * DAY_MS
    const { year, month, day: dayOfMonth, weekend } = localDay(dayStart)

    for (const trail of ranked) {
      const audience = audiences.get(String(trail._id))
      for (const [hour, weight] of Object.entries(HOUR_WEIGHTS)) {
        const at = zonedTime(year, month, dayOfMonth, Number(hour))
        if (at.getTime() > now) continue

        const expected = (audience.length / userIds.length) * weight * (weekend ? 5 : 3)
        const visitors = Math.min(audience.length, Math.round(expected * random(0.5, 1.5)))
        if (visitors === 0) continue

        operations.push({
          updateOne: {
            filter: { trail: trail._id, hour: at },
            update: { $addToSet: { users: { $each: pickSome(audience, visitors) } } },
            upsert: true
          }
        })
      }
    }
  }

  if (operations.length > 0) await TrailActivity.bulkWrite(operations)
  return operations.length
}

async function simulateReports(trails, userIds, days, validated) {
  const hotSpots = trails.slice(0, 2).map((trail) => pointAlong(trail.path.coordinates))
  const count = days * 4

  const reports = Array.from({ length: count }, () => {
    const trail = pick(trails)
    const nearHotSpot = Math.random() < 0.4
    const [lon, lat] = nearHotSpot
      ? [pick(hotSpots)[0] + random(-0.0007, 0.0007), pick(hotSpots)[1] + random(-0.0007, 0.0007)]
      : pointAlong(trail.path.coordinates)

    return {
      author: pick(userIds),
      trail: trail._id,
      type: pick(REPORT_TYPES),
      severity: pick(REPORT_SEVERITIES),
      description: `${MARKER} simulated report`,
      location: { type: 'Point', coordinates: [lon, lat] },
      createdAt: new Date(Date.now() - random(0, days * DAY_MS)),
      ...(validated && { validationStatus: 'validated', validatedAt: new Date() })
    }
  })

  await Report.insertMany(reports)
  return reports.length
}

async function simulateEvents(trails, userIds, days) {
  const events = Math.max(3, Math.round(days / 2))
  let notifications = 0

  for (let i = 0; i < events; i++) {
    const trail = pick(trails)
    const at = new Date(Date.now() - random(0, days * DAY_MS))
    const closure = Math.random() < 0.4
    const recipients = pickSome(userIds, Math.round(random(3, 15)))

    await TrailStatusHistory.create({
      trail: trail._id,
      previousStatus: 'free',
      newStatus: closure ? 'closed' : 'at_risk',
      reason: closure
        ? `${MARKER} Closed after landslide reports`
        : `${MARKER} Reliable reports received`,
      changedBy: null,
      changedAt: at,
      alertedCount: recipients.length
    })

    await Notification.insertMany(
      recipients.map((user) => ({
        user,
        type: 'emergency',
        trail: trail._id,
        title: `${trail.name} is now ${closure ? 'closed' : 'at risk'}`,
        body: `${MARKER} ${trail.name} is now ${closure ? 'closed' : 'at risk'}`,
        sentAt: at
      }))
    )
    notifications += recipients.length
  }

  return { events, notifications }
}

async function main() {
  const { days, users, cleanup, validated } = parseArgs(process.argv.slice(2))

  if (!cleanup && !(Number.isInteger(days) && days > 0 && Number.isInteger(users) && users > 0)) {
    usage()
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI)

  try {
    const removed = await removeSimulated()

    if (cleanup) {
      console.log(`Removed the simulated statistics data (${removed} simulated users)`)
      return
    }

    const trails = await Trail.find().select('name path')
    if (trails.length === 0) {
      console.error('No trails found: run the seed first')
      process.exit(1)
    }

    const userIds = await createUsers(users)
    const buckets = await simulateActivity(trails, userIds, days)
    const reports = await simulateReports(trails, userIds, days, validated)
    const events = await simulateEvents(trails, userIds, days)

    console.log(`Simulated ${days} days on ${trails.length} trails with ${users} hikers:`)
    console.log(
      `  ${buckets} attendance hours, ${reports} reports${validated ? ' (already validated)' : ''}`
    )
    console.log(`  ${events.events} status events, ${events.notifications} notifications`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
