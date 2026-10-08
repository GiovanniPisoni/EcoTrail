import { readFileSync } from 'node:fs'
import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import User from '../../server/src/models/User.js'
import Trail from '../../server/src/models/Trail.js'
import Report from '../../server/src/models/Report.js'
import TrailStatusHistory from '../../server/src/models/TrailStatusHistory.js'
import Notification from '../../server/src/models/Notification.js'
import ReputationChange from '../../server/src/models/ReputationChange.js'
import SentAlert from '../../server/src/models/SentAlert.js'
import TrailActivity from '../../server/src/models/TrailActivity.js'
import UserPresence from '../../server/src/models/UserPresence.js'
import { enrichTrail } from '../../server/scripts/data/enrich-trails.js'
import { E2E_MONGODB_URI, E2E_USERS, E2E_TRAIL_NAME } from './e2e-config.js'

const trailsData = JSON.parse(
  readFileSync(new URL('../../server/data/trails-andalo.json', import.meta.url), 'utf-8')
)

const MODELS = [
  User,
  Trail,
  Report,
  TrailStatusHistory,
  Notification,
  ReputationChange,
  SentAlert,
  TrailActivity,
  UserPresence
]

async function connect() {
  if (mongoose.connection.readyState === 1) return
  if (!new URL(E2E_MONGODB_URI).pathname.endsWith('_e2e')) {
    throw new Error(`Refusing to run the e2e tasks on a non-e2e database: ${E2E_MONGODB_URI}`)
  }
  await mongoose.connect(E2E_MONGODB_URI)
  await Promise.all(MODELS.map((model) => model.init()))
}

async function findHiker() {
  return User.findOne({ email: E2E_USERS.hiker.email })
}

async function findE2eTrail() {
  return Trail.findOne({ name: E2E_TRAIL_NAME })
}

export async function seedDatabase() {
  await connect()
  await Promise.all(MODELS.map((model) => model.deleteMany({})))

  await User.create([
    {
      email: E2E_USERS.hiker.email,
      password: await bcrypt.hash(E2E_USERS.hiker.password, 4),
      role: 'hiker'
    },
    {
      email: E2E_USERS.admin.email,
      password: await bcrypt.hash(E2E_USERS.admin.password, 4),
      role: 'admin'
    }
  ])
  await Trail.create(trailsData.map(enrichTrail))

  const trail = await findE2eTrail()
  const [longitude, latitude] = trail.path.coordinates[0]
  return { trail: { id: String(trail._id), name: trail.name, latitude, longitude } }
}

// Each entry: type, severity, validationStatus, isSuspicious, minutesAgo, description
export async function insertReports(entries) {
  await connect()
  const hiker = await findHiker()
  const trail = await findE2eTrail()
  const [longitude, latitude] = trail.path.coordinates[0]

  const created = await Report.create(
    entries.map((entry, index) => ({
      author: hiker._id,
      trail: trail._id,
      type: entry.type ?? 'fallen_tree',
      severity: entry.severity ?? 'medium',
      validationStatus: entry.validationStatus ?? 'pending',
      isSuspicious: entry.isSuspicious ?? false,
      ...(entry.validationNote && { validationNote: entry.validationNote }),
      description: entry.description ?? `E2E report ${index + 1}`,
      location: { type: 'Point', coordinates: [longitude + index * 0.002, latitude] },
      createdAt: new Date(Date.now() - (entry.minutesAgo ?? 1) * 60 * 1000)
    }))
  )
  return created.map((report) => String(report._id))
}

export async function listReports() {
  await connect()
  const reports = await Report.find({}).sort({ createdAt: 1 }).lean()
  return reports.map((report) => ({
    id: String(report._id),
    type: report.type,
    severity: report.severity,
    validationStatus: report.validationStatus,
    validationNote: report.validationNote ?? null,
    isSuspicious: Boolean(report.isSuspicious),
    markedAsSpam: Boolean(report.markedAsSpam),
    hasPhoto: Boolean(report.photoUrl)
  }))
}

export async function getTrailStatus(name) {
  await connect()
  const trail = await Trail.findOne({ name }).lean()
  return trail?.status ?? null
}

export async function setHikerReputation(value) {
  await connect()
  await User.updateOne({ email: E2E_USERS.hiker.email }, { reputation: value })
  return null
}

export async function getHikerReputation() {
  await connect()
  const hiker = await findHiker()
  return hiker.reputation
}

// Each entry: type, title, body, url, minutesAgo, read
export async function insertNotifications(entries) {
  await connect()
  const hiker = await findHiker()
  const trail = await findE2eTrail()

  await Notification.create(
    entries.map((entry) => ({
      user: hiker._id,
      trail: trail._id,
      type: entry.type ?? 'emergency',
      title: entry.title,
      body: entry.body,
      url: entry.url,
      sentAt: new Date(Date.now() - (entry.minutesAgo ?? 1) * 60 * 1000),
      readAt: entry.read ? new Date() : null
    }))
  )
  return null
}

export async function insertActivity({ hikers = 3, hoursAgo = 2 } = {}) {
  await connect()
  const trail = await findE2eTrail()
  const hour = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
  hour.setMinutes(0, 0, 0)

  await TrailActivity.create({
    trail: trail._id,
    hour,
    users: Array.from({ length: hikers }, () => new mongoose.Types.ObjectId())
  })
  return null
}

// Each entry: newStatus, reason, automatic, alertedCount
export async function insertTrailHistory(entries) {
  await connect()
  const trail = await findE2eTrail()
  const admin = await User.findOne({ email: E2E_USERS.admin.email })

  await TrailStatusHistory.create(
    entries.map((entry) => ({
      trail: trail._id,
      previousStatus: 'free',
      newStatus: entry.newStatus,
      reason: entry.reason,
      changedBy: entry.automatic ? null : admin._id,
      alertedCount: entry.alertedCount ?? 0
    }))
  )
  return null
}

export async function updateTrail({ name = E2E_TRAIL_NAME, set }) {
  await connect()
  await Trail.updateOne({ name }, { $set: set })
  return null
}

export async function proposeClosure({ reason, reportCount }) {
  await connect()
  await Trail.updateOne(
    { name: E2E_TRAIL_NAME },
    { $set: { closureProposal: { reason, reportCount, proposedAt: new Date() } } }
  )
  return null
}
