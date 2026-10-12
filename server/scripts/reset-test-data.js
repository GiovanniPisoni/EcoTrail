import 'dotenv/config'
import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import User from '../src/models/User.js'
import Trail from '../src/models/Trail.js'
import Report from '../src/models/Report.js'
import ReportPhoto from '../src/models/ReportPhoto.js'
import ReputationChange from '../src/models/ReputationChange.js'
import Notification from '../src/models/Notification.js'
import TrailStatusHistory from '../src/models/TrailStatusHistory.js'
import SentAlert from '../src/models/SentAlert.js'
import TrailActivity from '../src/models/TrailActivity.js'
import UserPresence from '../src/models/UserPresence.js'

const CLEARED = [
  ['reports', Report],
  ['report photos', ReportPhoto],
  ['reputation changes', ReputationChange],
  ['notifications', Notification],
  ['trail status history', TrailStatusHistory],
  ['sent alerts', SentAlert],
  ['trail activity', TrailActivity],
  ['user positions', UserPresence]
]

// Brings the database back to a clean starting point after trying the app: no reports, no history,
// every trail free. Trails and admin accounts are never deleted. Without `apply` it only counts.
export async function resetTestData({ keepEmails = [], riskTrail, reason, apply = false } = {}) {
  const keep = keepEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)
  const userFilter = { role: { $ne: 'admin' }, email: { $nin: keep } }

  const summary = { cleared: {}, usersDeleted: 0, trailsReset: 0, risk: null }

  if (riskTrail) {
    if (!reason) throw new Error('A reason is needed to set the trail at risk')
    if (!(await Trail.exists({ name: riskTrail }))) {
      throw new Error(`No trail called "${riskTrail}"`)
    }
  }

  for (const [label, model] of CLEARED) {
    summary.cleared[label] = await model.countDocuments()
    if (apply) await model.deleteMany({})
  }

  summary.usersDeleted = await User.countDocuments(userFilter)
  if (apply) {
    await User.deleteMany(userFilter)
    await User.updateMany({}, { $set: { reputation: 0 } })
  }

  summary.trailsReset = await Trail.countDocuments({ status: { $ne: 'free' } })
  if (apply) {
    await Trail.updateMany(
      {},
      { $set: { status: 'free' }, $unset: { closureProposal: '', closureDismissedAt: '' } }
    )
  }

  if (riskTrail) {
    const trail = await Trail.findOne({ name: riskTrail })
    summary.risk = { trail: trail.name, reason }

    if (apply) {
      const admin = await User.findOne({ role: 'admin' })
      await Trail.updateOne({ _id: trail._id }, { $set: { status: 'at_risk' } })
      await TrailStatusHistory.create({
        trail: trail._id,
        previousStatus: 'free',
        newStatus: 'at_risk',
        reason,
        changedBy: admin?._id ?? null
      })
    }
  }

  return summary
}

function readOption(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function printSummary(summary, apply) {
  console.log(apply ? 'Done:' : 'Dry run, nothing was changed. This would happen:')
  for (const [label, count] of Object.entries(summary.cleared)) {
    console.log(`  - ${count} ${label} removed`)
  }
  console.log(`  - ${summary.usersDeleted} non-admin accounts removed`)
  console.log(`  - ${summary.trailsReset} trails set back to free`)
  if (summary.risk) console.log(`  - "${summary.risk.trail}" set at risk: ${summary.risk.reason}`)
  if (!apply) console.log('\nRun again with --yes to apply it.')
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--yes')

  await mongoose.connect(process.env.MONGODB_URI)
  const summary = await resetTestData({
    keepEmails: (readOption(args, '--keep') ?? '').split(','),
    riskTrail: readOption(args, '--risk'),
    reason: readOption(args, '--reason'),
    apply
  })
  printSummary(summary, apply)
  await mongoose.connection.close()
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Error while resetting the data:', err.message)
    process.exit(1)
  })
}
