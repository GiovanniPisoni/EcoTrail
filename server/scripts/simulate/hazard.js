import 'dotenv/config'
import mongoose from 'mongoose'
import Trail from '../../src/models/Trail.js'
import User from '../../src/models/User.js'
import Report from '../../src/models/Report.js'
import Notification from '../../src/models/Notification.js'

const SIMULATED_EMAIL_DOMAIN = '@simulated.ecotrail.test'
const SIMULATED_PASSWORD = 'simulated-pass'
const DESCRIPTION_PREFIX = '[simulation]'
const DEFAULT_API = `http://localhost:${process.env.PORT || 3000}/api`

function parseArgs(argv) {
  const options = { trail: null, reports: null, severity: 'high', api: DEFAULT_API, cleanup: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--trail') options.trail = argv[++i]
    else if (argv[i] === '--reports') options.reports = Number(argv[++i])
    else if (argv[i] === '--severity') options.severity = argv[++i]
    else if (argv[i] === '--api') options.api = argv[++i]
    else if (argv[i] === '--cleanup') options.cleanup = true
  }
  return options
}

function usage() {
  console.log('Usage:')
  console.log(
    '  npm run simulate:hazard -w server -- --trail <name or id> --reports <count> [--severity low|medium|high]'
  )
  console.log('  npm run simulate:hazard -w server -- --trail <name or id> --cleanup')
}

async function findTrail(query) {
  if (mongoose.Types.ObjectId.isValid(query)) {
    const byId = await Trail.findById(query)
    if (byId) return byId
  }
  return Trail.findOne({ name: query })
}

async function api(base, path, { method = 'POST', body, token } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    },
    body: body && JSON.stringify(body)
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

async function simulatedUserToken(base, index) {
  const email = `hazard-${index}${SIMULATED_EMAIL_DOMAIN}`
  await api(base, '/auth/register', { body: { email, password: SIMULATED_PASSWORD } })
  const login = await api(base, '/auth/login', { body: { email, password: SIMULATED_PASSWORD } })
  return login.body.token
}

async function describeTrail(trailId) {
  const trail = await Trail.findById(trailId).lean()
  const proposal = trail.closureProposal
    ? `closure proposed (${trail.closureProposal.reportCount} reports)`
    : 'no closure proposal'
  return `status "${trail.status}", ${proposal}`
}

async function removeSimulation() {
  const users = await User.find({ email: { $regex: `${SIMULATED_EMAIL_DOMAIN}$` } }).select('_id')
  const ids = users.map((user) => user._id)
  const [reports] = await Promise.all([
    Report.deleteMany({ author: { $in: ids } }),
    Notification.deleteMany({ user: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } })
  ])
  return { users: ids.length, reports: reports.deletedCount }
}

async function main() {
  const {
    trail: trailQuery,
    reports: count,
    severity,
    api: base,
    cleanup
  } = parseArgs(process.argv.slice(2))

  if (!trailQuery || (!cleanup && !(Number.isInteger(count) && count > 0))) {
    usage()
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI)

  try {
    const trail = await findTrail(trailQuery)
    if (!trail) {
      console.error(`Trail "${trailQuery}" not found`)
      process.exit(1)
    }

    if (cleanup) {
      const removed = await removeSimulation()
      console.log(`Removed ${removed.users} simulated users and ${removed.reports} reports`)
      console.log(
        `The trail now has ${await describeTrail(trail._id)}: reset it from the admin panel if needed`
      )
      return
    }

    await removeSimulation()

    const [longitude, latitude] = trail.path.coordinates[0]
    console.log(`Trail "${trail.name}" starts with ${await describeTrail(trail._id)}`)

    for (let i = 1; i <= count; i++) {
      const token = await simulatedUserToken(base, i)
      const response = await api(base, '/reports', {
        token,
        body: {
          type: 'fallen_tree',
          severity,
          description: `${DESCRIPTION_PREFIX} report ${i}`,
          latitude,
          longitude
        }
      })

      if (response.status !== 201) {
        console.error(`Report ${i} failed (${response.status}):`, response.body)
        process.exit(1)
      }
      console.log(`After report ${i}/${count}: ${await describeTrail(trail._id)}`)
    }
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
